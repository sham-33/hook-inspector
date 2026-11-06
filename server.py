"""Local Hook Inspector. Python 3.10+, standard library only."""
import json, sqlite3, time, os
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
ROOT = Path(__file__).resolve().parent
DB = ROOT / 'events.sqlite3'

def connect():
    db = sqlite3.connect(DB)
    db.execute('CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
    return db

def inspect_event(payload):
    if not isinstance(payload, dict): raise ValueError('Expected a JSON object')
    event = str(payload.get('hook_event_name', 'Unknown'))
    tool = str(payload.get('tool_name', ''))
    inputs = payload.get('tool_input', {})
    if not isinstance(inputs, dict): raise ValueError('tool_input must be an object')
    path = str(inputs.get('file_path', ''))
    cwd = Path(str(payload.get('cwd', ROOT))).resolve()
    target = (cwd / path).resolve() if path else None
    protected = json.loads((ROOT / 'policy.json').read_text())['protected_paths']
    blocked = event == 'PreToolUse' and tool in ('Write', 'Edit', 'MultiEdit') and target and any(target == (cwd / p).resolve() or (cwd / p).resolve() in target.parents for p in protected)
    record = {'time':time.time(), 'event':event, 'tool':tool, 'session':str(payload.get('session_id','local')), 'path':path, 'status':'blocked' if blocked else 'allowed', 'reason':'Protected path policy' if blocked else 'Event recorded', 'demo':bool(payload.get('demo', False))}
    with connect() as db:
        cur=db.execute('INSERT INTO events(data) VALUES (?)', (json.dumps(record),)); record['id']=cur.lastrowid
    result = {'record':record}
    if blocked: result['hookSpecificOutput']={'hookEventName':'PreToolUse','permissionDecision':'deny','permissionDecisionReason':'Hook Inspector: protected path'}
    return result

class Handler(BaseHTTPRequestHandler):
    def send(self, status, body, kind='application/json'):
        raw = json.dumps(body).encode() if kind=='application/json' else body
        self.send_response(status); self.send_header('Content-Type',kind); self.send_header('Content-Length',str(len(raw))); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        if self.path == '/api/events':
            with connect() as db: rows=db.execute('SELECT id,data FROM events ORDER BY id DESC LIMIT 1000').fetchall()
            return self.send(200,[dict(json.loads(data),id=id) for id,data in rows])
        if self.path == '/api/policy': return self.send(200,json.loads((ROOT/'policy.json').read_text()))
        if self.path in ('/','/index.html'): return self.send(200,(ROOT/'static/index.html').read_bytes(),'text/html; charset=utf-8')
        self.send(404,{'error':'Not found'})
    def do_POST(self):
        if self.headers.get('Origin') and self.headers['Origin'] != 'http://'+self.headers.get('Host',''):
            return self.send(403,{'error':'Cross-origin requests rejected'})
        if self.path != '/api/events': return self.send(404,{'error':'Not found'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0 < size <= 65536: raise ValueError('Body must be 1–65536 bytes')
            result=inspect_event(json.loads(self.rfile.read(size)))
            self.send(200,result)
        except (ValueError,TypeError) as e: self.send(400,{'error':str(e)})
    def log_message(self,*args): pass

if __name__=='__main__':
    port=int(os.environ.get('PORT','8765'))
    print(f'Hook Inspector: http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
