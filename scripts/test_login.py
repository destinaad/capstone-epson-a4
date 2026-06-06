import json
import urllib.request

url = 'http://localhost:8000/auth/login'
creds = {'username':'supervisor1','password':'rahasia123'}
req = urllib.request.Request(url, data=json.dumps(creds).encode('utf-8'), headers={'Content-Type':'application/json'})
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print('STATUS', r.status)
        print(r.read().decode())
except Exception as e:
    print('ERROR', repr(e))
