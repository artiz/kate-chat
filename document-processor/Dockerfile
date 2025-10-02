  
FROM unit:python3.12

WORKDIR /home

# Copy requirements and install Python dependencies
COPY document-processor/requirements.txt ./
RUN pip install -r requirements.txt

RUN mkdir /home/unit
ENV HOME=/home/unit

RUN mkdir /app
WORKDIR /app/

# ensures that the python output is sent straight to terminal (e.g. your container log)
# without being first buffered and that you can see the output of your application (e.g. django logs)
# in real time. Equivalent to python -u: https://docs.python.org/3/using/cmdline.html#cmdoption-u
ENV PYTHONUNBUFFERED 1

COPY document-processor/ ./

# Set proper permissions
RUN chown -R unit:unit /var/lib/unit/
RUN chown -R unit:unit /app
RUN chown -R unit:unit /home/unit

COPY document-processor/config.json /docker-entrypoint.d/config.json

# Expose port 8080 for health checks and API
EXPOSE 8080
