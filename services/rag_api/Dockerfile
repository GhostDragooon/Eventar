FROM python:3.12-slim
ENV UV_NO_DEV=1
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev && useradd --create-home app && chown -R app /app
USER app
EXPOSE 8000
CMD ["uv","run","uvicorn","rag_api.main:app","--app-dir","src","--host","0.0.0.0","--port","8000"]
