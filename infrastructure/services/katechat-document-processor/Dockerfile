FROM python:3.14
ARG COMMIT_SHA=""

WORKDIR /app

# Install Rust toolchain for building dependencies
RUN apt-get update && apt-get install -y curl && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy requirements and install Python dependencies
COPY document-processor/requirements.txt ./
# Workaround for pydantic-core/pyo3 on Python 3.14
ENV PYO3_USE_ABI3_FORWARD_COMPATIBILITY=1
RUN pip install --no-cache-dir -r requirements.txt

# ensures that the python output is sent straight to terminal (e.g. your container log)
# without being first buffered and that you can see the output of your application (e.g. django logs)
# in real time. Equivalent to python -u: https://docs.python.org/3/using/cmdline.html#cmdoption-u
ENV PYTHONUNBUFFERED=1

ENV COMMIT_SHA=$COMMIT_SHA

# Copy application code
COPY document-processor/ ./

# Expose port 8080 for health checks and API
EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
