"""Worker process management for document parsing."""

from __future__ import annotations

import asyncio
import contextlib
import io
import json
import logging
import multiprocessing
import os
import tempfile
import uuid
import sys
from dataclasses import dataclass
from multiprocessing.connection import Connection, Listener
from pathlib import Path
from typing import Dict, Optional

from docling.datamodel.base_models import ConversionStatus

from app.parser import JsonReportProcessor, PDFParser


logger = logging.getLogger(__name__)


class WorkerPoolError(RuntimeError):
    """Raised when a worker process fails or disconnects."""


class WorkerTaskError(WorkerPoolError):
    """Raised when a worker completes a task but reports a failure."""


@dataclass(eq=False)
class WorkerHandle:
    worker_id: int
    process: multiprocessing.Process
    connection: Connection
    tasks_completed: int = 0

    def close(self):
        with contextlib.suppress(OSError, EOFError):
            self.connection.close()


class WorkerPool:
    """Manages child processes that run PDF parsing workloads."""

    def __init__(
        self,
        num_workers: int,
        assets_dir: Path,
        log: logging.Logger,
        restart_after: int = 20,
    ):
        self._num_workers = max(1, num_workers)
        self._assets_dir = assets_dir
        self._log = log
        self._workers: Dict[int, WorkerHandle] = {}
        self._available: Optional[asyncio.Queue[WorkerHandle]] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._shutdown = False
        self._restart_after = max(0, restart_after)

    async def start(self):
        if self._shutdown:
            raise WorkerPoolError("Cannot restart worker pool after shutdown")

        self._loop = asyncio.get_running_loop()
        self._available = asyncio.Queue()

        self._log.info("Starting %s document worker processes", self._num_workers)

        for worker_idx in range(self._num_workers):
            worker = await self._spawn_worker(worker_idx)
            await self._available.put(worker)

    async def shutdown(self):
        if self._shutdown:
            return

        self._shutdown = True
        if self._available is None:
            return

        self._log.info("Stopping document worker processes")

        # Signal shutdown
        for worker in list(self._workers.values()):
            try:
                await asyncio.to_thread(self._send_shutdown, worker)
            except Exception:
                self._log.warning(
                    "Failed to send shutdown to worker %s", worker.worker_id
                )

        # Wait for processes to exit
        for worker in list(self._workers.values()):
            await asyncio.to_thread(self._force_process_exit, worker, 10.0)
            worker.close()

        self._workers.clear()

        if self._available is not None:
            while True:
                try:
                    self._available.get_nowait()
                except asyncio.QueueEmpty:
                    break
            self._available = None

    @property
    def is_running(self) -> bool:
        return not self._shutdown

    async def run_parse(self, input_path: Path, output_path: Path) -> Dict[str, str]:
        if self._available is None:
            raise WorkerPoolError("Worker pool has not been started")

        worker = await self._available.get()
        recycle_due_to_error = False
        try:
            result = await asyncio.to_thread(
                self._execute_parse_command, worker, input_path, output_path
            )
            return result
        except Exception as exc:
            if not isinstance(exc, (asyncio.CancelledError, WorkerTaskError)):
                recycle_due_to_error = True
            raise
        finally:
            process_restart = True
            if self._available is None:
                process_restart = False
            if self._shutdown:
                worker.close()
                process_restart = False

            if process_restart:
                restart_due_to_limit = (
                    self._restart_after > 0
                    and worker.tasks_completed >= self._restart_after
                )
                should_recycle = recycle_due_to_error or restart_due_to_limit

                if should_recycle:
                    try:
                        await self._recycle_worker(worker)
                    except Exception:
                        self._log.error("Failed to recycle worker %s", worker.worker_id)
                        raise
                else:
                    await self._available.put(worker)

    async def _consume_startup_messages(self, worker: WorkerHandle):
        while True:
            message = await asyncio.to_thread(worker.connection.recv)
            msg_type = message.get("type")
            if msg_type == "log":
                self._forward_log(worker.worker_id, message)
                continue
            if msg_type == "ready":
                break
            if msg_type == "result":
                # Should not happen during startup but handle defensively
                self._forward_log(
                    worker.worker_id,
                    {
                        "level": "ERROR",
                        "message": f"Unexpected result during startup: {message}",
                    },
                )

    async def _spawn_worker(self, worker_idx: int) -> WorkerHandle:
        if self._shutdown:
            raise WorkerPoolError("Worker pool is stopped")

        socket_name = f"docproc_{os.getpid()}_{uuid.uuid4().hex}.sock"
        listener_path = Path(tempfile.gettempdir()) / socket_name
        if listener_path.exists():
            listener_path.unlink()

        listener = Listener(str(listener_path), family="AF_UNIX")

        process = multiprocessing.Process(
            target=_worker_process_entrypoint,
            name=f"docproc-worker-{worker_idx}",
            args=(worker_idx, str(listener_path), str(self._assets_dir)),
            daemon=True,
        )
        process.start()

        try:
            conn = await asyncio.to_thread(listener.accept)
        except Exception:
            if process.is_alive():
                process.kill()
                process.join(timeout=1)
            raise
        finally:
            listener.close()
            with contextlib.suppress(OSError):
                listener_path.unlink()

        if self._shutdown:
            worker = WorkerHandle(worker_idx, process, conn)
            await asyncio.to_thread(self._send_shutdown, worker)
            await asyncio.to_thread(self._force_process_exit, worker, 5.0)
            worker.close()
            raise WorkerPoolError("Worker pool is stopped")

        worker = WorkerHandle(worker_idx, process, conn)
        await self._consume_startup_messages(worker)
        self._workers[worker_idx] = worker
        self._log.debug("Worker %s ready", worker_idx)
        return worker

    async def _recycle_worker(self, worker: WorkerHandle):
        if self._shutdown or self._available is None:
            worker.close()
            return

        worker_id = worker.worker_id
        self._log.info(
            "Restarting worker %s after %s tasks", worker_id, worker.tasks_completed
        )

        await asyncio.to_thread(self._send_shutdown, worker)
        await asyncio.to_thread(self._force_process_exit, worker, 10.0)
        worker.close()
        self._workers.pop(worker_id, None)

        if self._shutdown:
            return

        new_worker = await self._spawn_worker(worker_id)
        await self._available.put(new_worker)

    def _force_process_exit(self, worker: WorkerHandle, timeout: float = 10.0):
        worker.process.join(timeout)
        if worker.process.is_alive():
            self._log.warning(
                "Worker %s did not exit in time; terminating", worker.worker_id
            )
            worker.process.kill()
            worker.process.join(5.0)

    def _execute_parse_command(
        self, worker: WorkerHandle, input_path: Path, output_path: Path
    ) -> Dict[str, str]:
        try:
            worker.connection.send(
                {
                    "cmd": "parse",
                    "input_path": str(input_path),
                    "output_path": str(output_path),
                }
            )
        except (BrokenPipeError, EOFError, OSError) as exc:
            raise WorkerPoolError(
                f"Failed to send command to worker {worker.worker_id}: {exc}"
            ) from exc

        while True:
            try:
                response = worker.connection.recv()
            except (EOFError, OSError) as exc:
                raise WorkerPoolError(
                    f"Worker {worker.worker_id} disconnected unexpectedly"
                ) from exc

            msg_type = response.get("type")
            if msg_type == "log":
                self._forward_log(worker.worker_id, response)
                continue
            if msg_type == "result":
                status = response.get("status")
                if status == "success":
                    worker.tasks_completed += 1
                    return response
                worker.tasks_completed += 1
                error_message = response.get("error", "Unknown worker error")
                raise WorkerTaskError(error_message)
            if msg_type == "ready":
                # Ignore late ready message
                continue

    def _forward_log(self, worker_id: int, payload: Dict[str, str]):
        message = payload.get("message", "")
        level_name = payload.get("level", "INFO").upper()
        level = getattr(logging, level_name, logging.INFO)
        self._log.log(level, f"[worker-{worker_id}] {message}")

    @staticmethod
    def _send_shutdown(worker: WorkerHandle):
        with contextlib.suppress(BrokenPipeError, EOFError, OSError):
            worker.connection.send({"cmd": "shutdown"})


class _ConnectionLogHandler(logging.Handler):
    """Logging handler that forwards worker log records to the parent process."""

    def __init__(self, connection: Connection, worker_id: int):
        super().__init__()
        self._connection = connection
        self._worker_id = worker_id

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            self._connection.send(
                {
                    "type": "log",
                    "level": record.levelname,
                    "message": msg,
                    "worker_id": self._worker_id,
                }
            )
        except Exception:  # noqa: BLE001
            # Nothing we can do if the connection is down; swallow errors to avoid
            # recursive logging failures inside the worker.
            pass


class _ConnectionStream(io.TextIOBase):
    """Text stream redirecting stdout/stderr to the parent process."""

    def __init__(self, connection: Connection, worker_id: int, level: str):
        super().__init__()
        self._connection = connection
        self._worker_id = worker_id
        self._level = level
        self._buffer = ""

    def write(self, text: str) -> int:
        if not text:
            return 0
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            self._send(line)
        return len(text)

    def flush(self) -> None:
        if self._buffer:
            self._send(self._buffer)
            self._buffer = ""

    def _send(self, message: str) -> None:
        message = message.rstrip()
        if not message:
            return
        with contextlib.suppress(Exception):  # noqa: BLE001
            self._connection.send(
                {
                    "type": "log",
                    "level": self._level,
                    "message": message,
                    "worker_id": self._worker_id,
                }
            )


def _worker_process_entrypoint(worker_id: int, address: str, assets_dir: str):
    """Entry point executed in each worker subprocess."""
    from multiprocessing.connection import Client

    conn: Optional[Connection] = None
    try:
        conn = Client(address, family="AF_UNIX")

        # Route stdout/stderr and logging through the parent connection.
        handler = _ConnectionLogHandler(conn, worker_id)
        handler.setFormatter(logging.Formatter("%(message)s"))

        root_logger = logging.getLogger()
        for existing in list(root_logger.handlers):
            root_logger.removeHandler(existing)
        root_logger.addHandler(handler)
        root_logger.setLevel(logging.INFO)

        sys.stdout = _ConnectionStream(conn, worker_id, "INFO")
        sys.stderr = _ConnectionStream(conn, worker_id, "ERROR")

        log = logging.getLogger(f"docproc.worker.{worker_id}")
        log.info("Worker process bootstrapping")

        parser = PDFParser()
        log.info("Load Docling models...")
        parser.convert_document(Path(assets_dir) / "dummy_report.pdf")
        processor = JsonReportProcessor()

        conn.send({"type": "ready", "worker_id": worker_id})

        while True:
            try:
                command = conn.recv()
            except EOFError:
                break

            if not isinstance(command, dict):
                log.warning("Ignoring malformed command: %s", command)
                continue

            action = command.get("cmd")
            if action == "shutdown":
                log.info("Shutdown command received")
                break

            if action != "parse":
                log.error("Unsupported command: %s", action)
                continue

            input_path = Path(command["input_path"]).resolve()
            output_path = Path(command["output_path"]).resolve()

            try:
                log.info("Parsing %s", input_path.name)
                conv_result = parser.convert_document(input_path)
                if conv_result.status != ConversionStatus.SUCCESS:
                    conn.send(
                        {
                            "type": "result",
                            "status": "error",
                            "error": f"Conversion status: {conv_result.status.name}",
                            "worker_id": worker_id,
                        }
                    )
                    continue

                normalized_data = parser._normalize_page_sequence(
                    conv_result.document.export_to_dict()
                )
                processed_report = processor.assemble_report(
                    conv_result, normalized_data
                )

                output_path.write_text(
                    json.dumps(processed_report, indent=2, ensure_ascii=False),
                    encoding="utf-8",
                )

                conn.send(
                    {
                        "type": "result",
                        "status": "success",
                        "worker_id": worker_id,
                        "output_path": str(output_path),
                        "conversion_status": conv_result.status.name,
                    }
                )

            except Exception as exc:  # noqa: BLE001
                log.error("Failed to parse %s", input_path)
                with contextlib.suppress(Exception):
                    conn.send(
                        {
                            "type": "result",
                            "status": "error",
                            "error": str(exc),
                            "worker_id": worker_id,
                        }
                    )

    except Exception as exc:  # noqa: BLE001
        if conn is not None:
            with contextlib.suppress(Exception):
                conn.send(
                    {
                        "type": "result",
                        "status": "error",
                        "error": f"Fatal worker error: {exc}",
                        "worker_id": worker_id,
                    }
                )
    finally:
        if conn is not None:
            with contextlib.suppress(Exception):
                conn.close()
