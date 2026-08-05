#!/usr/bin/env python3
"""
数据清洗记录管理工具 — 共享数据后端
轻量 HTTP 服务：静态文件 + JSON 数据存储
零依赖，仅用 Python 标准库
"""

import json
import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
LOCK = threading.Lock()


def load_data():
    """读取 data.json，不存在则返回空数组"""
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_data(data):
    """写入 data.json"""
    with LOCK:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)


class Handler(SimpleHTTPRequestHandler):
    """自定义请求处理器：API + 静态文件"""

    def __init__(self, *args, **kwargs):
        # 静态文件从项目目录提供
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # 允许跨域（局域网内任何设备访问）
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        """处理 CORS 预检请求"""
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        # API: 获取所有记录
        if parsed.path == '/api/records':
            data = load_data()
            self._json_response({'records': data})
            return

        # API: 导出 data.json
        if parsed.path == '/api/export':
            data = load_data()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="data_backup.json"')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))
            return

        # 静态文件
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)

        # API: 保存所有记录
        if parsed.path == '/api/records':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)
                data = json.loads(body.decode('utf-8'))

                # 支持 {records: [...]} 或直接 [...]
                records = data.get('records', data) if isinstance(data, dict) else data
                save_data(records)

                self._json_response({'ok': True, 'count': len(records)})
            except Exception as e:
                self._json_response({'ok': False, 'error': str(e)}, status=500)
            return

        self.send_error(404, 'Not Found')

    def _json_response(self, obj, status=200):
        """发送 JSON 响应"""
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        """简洁日志：只记录 API 调用"""
        if '/api/' in (args[0] if args else ''):
            super().log_message(format, *args)


def main():
    # 初始化数据文件
    if not os.path.exists(DATA_FILE):
        save_data([])
        print(f'[初始化] 创建空数据文件: {DATA_FILE}')

    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'🚀 数据清洗记录服务已启动')
    print(f'   本机访问:   http://localhost:{PORT}')
    print(f'   局域网访问: http://<本机IP>:{PORT}')
    print(f'   数据文件:   {DATA_FILE}')
    print(f'   按 Ctrl+C 停止')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n👋 服务已停止')
        server.server_close()


if __name__ == '__main__':
    main()
