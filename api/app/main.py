from fastapi import FastAPI

app = FastAPI(title='ParcelCare API', version='0.2.0')


@app.get('/health')
def health() -> dict:
    return {'status': 'ok', 'service': 'parcelcare-api', 'mode': 'demo',
            'live_integrations': False}
