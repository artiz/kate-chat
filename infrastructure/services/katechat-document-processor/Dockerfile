FROM unit:python3.12
ARG COMMIT_SHA=""

WORKDIR /home

# Copy requirements and install Python dependencies
COPY document-processor/requirements.txt ./
RUN pip install -r requirements.txt

RUN mkdir /home/unit
ENV HOME=/home/unit

# Set up working directory
RUN mkdir /app
WORKDIR /app/

# Python configuration
ENV PYTHONUNBUFFERED=1

ENV COMMIT_SHA=$COMMIT_SHA

# Copy application code
COPY document-processor/ ./

# Set proper permissions
RUN chown -R unit:unit /var/lib/unit/
RUN chown -R unit:unit /app
RUN chown -R unit:unit /home/unit

# Copy Unit configuration
COPY infrastructure/services/katechat-document-processor/config.json /docker-entrypoint.d/config.json

# Expose port 8080 for health checks and API
EXPOSE 8080
