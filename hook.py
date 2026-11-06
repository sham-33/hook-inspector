"""Claude Code command hook: forwards stdin to the local inspector."""
import json, sys, urllib.request
try:
    payload=json.load(sys.stdin)
    request=urllib.request.Request('http://127.0.0.1:8765/api/events',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=3) as response: result=json.load(response)
    if 'hookSpecificOutput' in result: print(json.dumps({'hookSpecificOutput':result['hookSpecificOutput']}))
except Exception as error:
    print('Hook Inspector unavailable: '+str(error), file=sys.stderr)
    sys.exit(2)  # PreToolUse fails closed when receiver is unavailable.
