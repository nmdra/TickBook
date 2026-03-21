from fastapi import FastAPI
from contextlib import asynccontextmanager

from src.core.database import engine, Base
from src.api.payment_routes import router as payment_router

# වැඩසටහන පටන් ගනිද්දී (Startup) Database එකේ Table එක හදන විධානය
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Database එකේ Tables නැත්නම් අලුතින් හදන්න
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # වැඩසටහන නවත්වද්දී Engine එක වහන්න
    await engine.dispose()

# FastAPI ඇප් එක ආරම්භ කිරීම
app = FastAPI(
    title="TickBook Payment Service API",
    description="Payment processing service in Python",
    version="1.0.0",
    lifespan=lifespan # අර උඩ ලියපු startup function එක මෙතනට සම්බන්ධ කරනවා
)

# අපේ health check එක
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}

# අපි අලුතින් හදපු API දොරවල් ටික ඇප් එකට සම්බන්ධ කරනවා
app.include_router(payment_router)