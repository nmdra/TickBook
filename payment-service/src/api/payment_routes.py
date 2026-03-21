from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
from datetime import datetime

from src.core.database import get_db
from src.models.payment import Payment
from src.models.schemas import PaymentResponse, PaymentUpdateStatus
from src.models.schemas import PaymentResponse, PaymentUpdateStatus, PaymentCreate
from src.services.booking_client import validate_booking

# අලුත් Router එකක් හදනවා (මේක හරියට කාර්යාලයක වෙනම කවුන්ටරයක් හැදුවා වගේ)
router = APIRouter(prefix="/api/payments", tags=["Payments"])

# 1. සියලුම ගෙවීම් බැලීම (GET /api/payments)
@router.get("/", response_model=List[PaymentResponse])
async def get_all_payments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment))
    payments = result.scalars().all()
    return payments

# 2. නිශ්චිත ගෙවීමක් පමණක් බැලීම (GET /api/payments/{id})
@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(payment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment

# 3. ගෙවීමක තත්ත්වය වෙනස් කිරීම (PUT /api/payments/{id}/status)
@router.put("/{payment_id}/status", response_model=PaymentResponse)
async def update_payment_status(payment_id: int, payload: PaymentUpdateStatus, db: AsyncSession = Depends(get_db)):
    valid_statuses = ["pending", "completed", "failed", "refunded"]
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    
    if payment is None:
        raise HTTPException(status_code=404, detail="Payment not found")

    payment.status = payload.status
    payment.updated_at = datetime.utcnow() # වෙනස් වුණු වෙලාව update කරනවා
    
    await db.commit()
    await db.refresh(payment)
    return payment

# 4. අලුත් ගෙවීමක් පද්ධතියට ඇතුළත් කිරීම (POST /api/payments)
@router.post("/", response_model=PaymentResponse, status_code=201)
async def create_payment(payload: PaymentCreate, db: AsyncSession = Depends(get_db)):
    
    # 1. Booking Service එකෙන් අහලා බලනවා මේ Booking එක තියෙනවද කියලා
    # (Booking එක නැත්නම් මේක මෙතනින්ම නතර වෙලා Error එකක් යවනවා)
    await validate_booking(payload.booking_id)
    
    # 2. ඒක තියෙනවා නම්, අපි Payment එක Database එකට Save කරනවා
    new_payment = Payment(
        booking_id=payload.booking_id,
        user_id=payload.user_id,
        amount=payload.amount,
        status=payload.status,
        payment_method=payload.payment_method
    )
    
    db.add(new_payment)
    await db.commit()
    await db.refresh(new_payment)
    
    return new_payment