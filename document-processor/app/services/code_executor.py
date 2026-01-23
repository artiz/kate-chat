from typing import Dict, List, Any
import boto3
import io
import os
import json
import traceback
from contextlib import contextmanager, redirect_stdout, redirect_stderr


@contextmanager
def temporary_environment():
    """Remove AWS credentials from environment temporarily"""
    original_env = dict(os.environ)
    aws_vars = [
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_SECURITY_TOKEN",
    ]

    try:
        for var in aws_vars:
            if var in os.environ:
                del os.environ[var]
        yield
    finally:
        os.environ.clear()
        os.environ.update(original_env)


class CodeExecutor:
    def __init__(self):
        self.s3_client = boto3.client("s3")
        self.output_bucket = os.environ["OUTPUT_BUCKET"]

    def download_input_files(self, files: List[Dict[str, str]]) -> Dict[str, Any]:
        """Download requested files from S3 to /tmp"""
        file_metadata = {}

        for file_info in files:
            bucket = file_info["bucket"]
            key = file_info["key"]
            local_name = file_info.get("local_name", os.path.basename(key))
            local_path = f"/tmp/{local_name}"

            # Download file
            self.s3_client.download_file(bucket, key, local_path)

            # Store metadata
            file_metadata[local_name] = {
                "original_bucket": bucket,
                "original_key": key,
                "local_path": local_path,
                "metadata": file_info.get("metadata", {}),
            }

        return file_metadata

    def detect_new_files(
        self, original_files: set, chat_session_id: str
    ) -> Dict[str, str]:
        """Detect and upload new files in /tmp"""
        current_files = set(os.listdir("/tmp"))
        new_files = current_files - original_files
        uploaded_files = {}

        for filename in new_files:
            local_path = f"/tmp/{filename}"
            if os.path.isfile(local_path):
                # Generate S3 key
                s3_key = f"Plugins/CodeInterpreter/{chat_session_id}/{filename}"

                # Upload file
                self.s3_client.upload_file(local_path, self.output_bucket, s3_key)

                uploaded_files[filename] = {"bucket": self.output_bucket, "key": s3_key}

        return uploaded_files

    def capture_context(self, namespace: Dict) -> Dict:
        """Capture relevant variables from the execution context"""
        context = {}

        for key, value in namespace.items():
            # Skip builtins, modules, and private variables
            if (
                not key.startswith("__")
                and not hasattr(value, "__module__")
                and key not in ["exit", "quit"]
            ):
                try:
                    # Try to serialize the value
                    json.dumps(value)
                    context[key] = value
                except (TypeError, OverflowError):
                    # If value can't be serialized, store its string representation
                    context[key] = str(value)

        return context

    def execute_code(
        self,
        code: str,
        file_metadata: Dict,
        chat_session_id: str,
        available_tokens: int,
    ) -> Dict:
        """Execute code and capture all outputs and context"""
        # Store initial state of /tmp
        initial_files = set(os.listdir("/tmp"))

        # Prepare capture of stdout and stderr
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        result = {
            "success": False,
            "stdout": "",
            "stderr": "",
            "error_type": None,
            "error_message": None,
            "traceback": None,
            "context": {},
            "generated_files": {},
        }

        # Create namespace for code execution
        namespace = {"available_files": file_metadata, "__name__": "__main__"}

        # max item size (in bytes)
        MAX_SIZE = 50 * 1024

        try:
            # Execute code in controlled environment
            with temporary_environment(), redirect_stdout(
                stdout_capture
            ), redirect_stderr(stderr_capture):

                exec(code, namespace)

            result["success"] = True

            # Get raw outputs
            raw_stdout = stdout_capture.getvalue()
            raw_stderr = stderr_capture.getvalue()
            full_context = self.capture_context(namespace)

            # Calculate token usage
            stderr_tokens = min(
                self.token_count(raw_stderr), int(available_tokens * 0.1)
            )  # Reserve 10% for stderr
            remaining_tokens = available_tokens - stderr_tokens

            # Add stderr to result first (it's usually smaller and important for debugging)
            result["stderr"] = raw_stderr

            # Calculate estimated size of result so far
            current_size = self.estimate_size(result)

            remaining_size = MAX_SIZE - current_size

            # Process stdout and context based on both token limits and size limits
            stdout_tokens = self.token_count(raw_stdout)
            context_tokens = self.token_count(str(full_context))

            stdout_size = self.estimate_size(raw_stdout)
            context_size = self.estimate_size(full_context)

            # Check if we can fit everything within both limits
            if (stdout_tokens + context_tokens <= remaining_tokens) and (
                stdout_size + context_size <= remaining_size
            ):
                result["stdout"] = raw_stdout
                result["context"] = full_context
            else:
                # Need to adjust based on both token and size constraints

                # Prioritize stdout over context
                if stdout_tokens <= remaining_tokens and stdout_size <= remaining_size:
                    # Stdout fits - add it
                    result["stdout"] = raw_stdout

                    # Update remaining limits
                    remaining_tokens -= stdout_tokens
                    remaining_size -= stdout_size

                    # Now try to fit context with remaining budget
                    if remaining_tokens <= self.token_count(
                        '{"note": "Context omitted due to limits"}'
                    ) or remaining_size <= self.estimate_size(
                        {"note": "Context omitted due to limits"}
                    ):
                        result["context"] = {"note": "Context omitted due to limits"}
                    else:
                        # Add items to context until we reach either limit
                        trimmed_context = {}
                        tokens_used = 0
                        size_used = 0

                        for key, value in full_context.items():
                            item_str = f"{key}: {value}"
                            item_tokens = self.token_count(item_str)
                            item_size = self.estimate_size({key: value})

                            if (
                                tokens_used + item_tokens <= remaining_tokens
                                and size_used + item_size <= remaining_size
                            ):
                                trimmed_context[key] = value
                                tokens_used += item_tokens
                                size_used += item_size
                            else:
                                break

                        if len(trimmed_context) < len(full_context):
                            trimmed_context["note"] = (
                                f"Context truncated due to limits. {len(full_context) - len(trimmed_context)} items omitted."
                            )

                        result["context"] = trimmed_context
                else:
                    # Need to truncate stdout
                    # Use the more restrictive limit between tokens and size
                    max_stdout_tokens = remaining_tokens
                    max_stdout_size = remaining_size

                    # Truncate stdout based on both limits
                    result["stdout"] = self.truncate_with_dual_limits(
                        raw_stdout, max_stdout_tokens, max_stdout_size
                    )
                    result["context"] = {"note": "Context omitted due to limits"}

        except Exception as e:
            result.update(
                {
                    "error_type": type(e).__name__,
                    "error_message": str(e),
                    "traceback": traceback.format_exc(),
                }
            )

            # Check if error info exceeds limits
            if self.estimate_size(result) > MAX_SIZE:
                # Truncate traceback first since it's usually the largest
                if "traceback" in result and result["traceback"]:
                    tb_size = self.estimate_size(result["traceback"])
                    if (
                        tb_size > MAX_SIZE * 0.5
                    ):  # If traceback is using over 50% of allowed size
                        result["traceback"] = self.truncate_by_size(
                            result["traceback"],
                            int(MAX_SIZE * 0.3),  # Limit to 30% of total
                            "[Traceback truncated due to size limits]",
                        )

        finally:
            # Always capture output if not already set
            if "stdout" not in result:
                result["stdout"] = stdout_capture.getvalue()
            if "stderr" not in result:
                result["stderr"] = stderr_capture.getvalue()

            # Final size check for the entire result
            while self.estimate_size(result) > MAX_SIZE:
                # Progressively reduce content until we're under the limit
                if len(result.get("context", {})) > 1:
                    # Remove context items one by one
                    keys = list(result["context"].keys())
                    if "note" in keys:
                        keys.remove("note")  # Keep the note if it exists
                    if keys:
                        del result["context"][keys[0]]
                        result["context"][
                            "note"
                        ] = "Context severely truncated due to size limits."
                        continue

                # If context is minimal or empty, truncate stdout
                if len(result["stdout"]) > 100:
                    result["stdout"] = self.truncate_by_size(
                        result["stdout"],
                        len(result["stdout"]) // 2,  # Cut in half
                        "\n... [Output severely truncated due to size limits] ...\n",
                    )
                    continue

                # If stdout is minimal, truncate stderr
                if len(result["stderr"]) > 100:
                    result["stderr"] = self.truncate_by_size(
                        result["stderr"],
                        len(result["stderr"]) // 2,  # Cut in half
                        "\n... [Error output severely truncated due to size limits] ...\n",
                    )
                    continue

                # If all else fails, truncate traceback or remove it
                if result.get("traceback") and len(result["traceback"]) > 100:
                    result["traceback"] = "[Traceback omitted due to size limits]"
                    continue

                # If we still exceed limits, make a drastic cut to stdout
                if len(result["stdout"]) > 0:
                    result["stdout"] = "[Output omitted due to size limits]"
                else:
                    # Last resort - clean minimal result
                    result = {
                        "success": result["success"],
                        "error_type": result.get("error_type"),
                        "error_message": "Execution result too large for storage",
                        "stdout": "[Output omitted due to size limits]",
                        "stderr": "[Error output omitted due to size limits]",
                        "context": {"note": "Context omitted due to size limits"},
                    }
                    break

            # Detect and upload new files
            result["generated_files"] = self.detect_new_files(
                initial_files, chat_session_id
            )

            # Clean up /tmp
            for file in os.listdir("/tmp"):
                try:
                    file_path = os.path.join("/tmp", file)
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                except Exception:
                    pass

        return result

    def token_count(self, payload):
        return int(len(str(payload)) / 4 * 1.1)

    def estimate_size(self, obj):
        """Estimate the size of an object in bytes for DynamoDB storage.

        Args:
            obj: Any Python object that will be stored in DynamoDB

        Returns:
            int: Estimated size in bytes
        """
        if obj is None:
            return 0

        if isinstance(obj, (str, bytes, bytearray)):
            return len(str(obj).encode("utf-8"))

        if isinstance(obj, (int, float, bool)):
            return len(str(obj).encode("utf-8"))

        if isinstance(obj, (list, tuple)):
            return sum(self.estimate_size(item) for item in obj)

        if isinstance(obj, dict):
            return sum(
                self.estimate_size(k) + self.estimate_size(v) for k, v in obj.items()
            )

        # For other types, convert to string and get size
        return len(str(obj).encode("utf-8"))

    def truncate_to_token_limit(self, text, max_tokens):
        """Truncate text to fit within a specified token limit.

        Args:
            text (str): The text to truncate
            max_tokens (int): Maximum number of tokens allowed

        Returns:
            str: Truncated text with a marker indicating truncation
        """
        if not text:
            return text

        # If text is already within limit, return as is
        if self.token_count(text) <= max_tokens:
            return text

        # Truncate the text
        truncation_marker = "\n... [Output truncated due to token limit] ...\n"
        truncation_marker_tokens = self.token_count(truncation_marker)
        target_tokens = max_tokens - truncation_marker_tokens

        # Binary search to find the right cutoff point
        left, right = 0, len(text)
        while left < right:
            mid = (left + right) // 2
            if self.token_count(text[:mid]) <= target_tokens:
                left = mid + 1
            else:
                right = mid

        return text[: left - 1] + truncation_marker

    def truncate_by_size(
        self, text, max_bytes, marker="\n... [Output truncated due to size limit] ...\n"
    ):
        """Truncate text to fit within a specified byte size.

        Args:
            text (str): The text to truncate
            max_bytes (int): Maximum number of bytes allowed
            marker (str): Marker to indicate truncation

        Returns:
            str: Truncated text with a marker indicating truncation
        """
        if not text:
            return text

        text_bytes = text.encode("utf-8")
        marker_bytes = marker.encode("utf-8")

        # If text is already within limit, return as is
        if len(text_bytes) <= max_bytes:
            return text

        # Calculate target size
        target_bytes = max_bytes - len(marker_bytes)
        if target_bytes <= 0:
            return marker

        # Binary search to find the right cutoff point
        left, right = 0, len(text)
        while left < right:
            mid = (left + right) // 2
            if len(text[:mid].encode("utf-8")) <= target_bytes:
                left = mid + 1
            else:
                right = mid

        return text[: left - 1] + marker

    def truncate_with_dual_limits(self, text, max_tokens, max_bytes):
        """Truncate text to respect both token and byte size limits.

        Args:
            text (str): The text to truncate
            max_tokens (int): Maximum number of tokens allowed
            max_bytes (int): Maximum number of bytes allowed

        Returns:
            str: Truncated text with a marker indicating truncation
        """
        # First truncate by tokens
        token_truncated = self.truncate_to_token_limit(text, max_tokens)

        # Then check if the result fits within byte limit
        if self.estimate_size(token_truncated) <= max_bytes:
            return token_truncated

        # If not, further truncate by size
        return self.truncate_by_size(
            token_truncated,
            max_bytes,
            "\n... [Output truncated due to size limits] ...\n",
        )
