  
FROM nginx/unit:1.27.0-python3.10

RUN mkdir /home/unit
ENV HOME /home/unit
RUN apt update && apt --no-install-recommends --no-install-suggests -y install postgresql-client

RUN mkdir /app
WORKDIR /app/

# ensures that the python output is sent straight to terminal (e.g. your container log)
# without being first buffered and that you can see the output of your application (e.g. django logs)
# in real time. Equivalent to python -u: https://docs.python.org/3/using/cmdline.html#cmdoption-u
ENV PYTHONUNBUFFERED 1

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# RUN chmod +x app/run.sh
RUN chown -R unit:unit /var/lib/unit/
RUN chown -R unit:unit .

COPY config.json /docker-entrypoint.d/config.json

# run the app (from parent Unit image)
# ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# CMD ["unitd", "--no-daemon", "--control", "unix:/var/run/control.unit.sock"]a