from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from decimal import Decimal

# මේක තමයි මූලික ආකෘතිය (Basic Application Form)
class PaymentBase(BaseModel):
    booking_id: int
    user_id: int
    amount: Decimal
    status: str = "pending"
    payment_method: Optional[str] = "pending_selection"

# අලුතින් Payment එකක් සාදද්දී එන Request එකේ හැඩය (POST Request)
class PaymentCreate(BaseModel):
    booking_id: int
    user_id: int
    amount: Decimal
    status: str = "pending"
    payment_method: str = "pending_selection"

# Status එක වෙනස් කරද්දී එන Request එකේ හැඩය (PUT Request)
class PaymentUpdateStatus(BaseModel):
    status: str

# අපි ආපහු යවන Response එකේ හැඩය (Outbound JSON)
class PaymentResponse(PaymentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True # Database එකේ objects කෙලින්ම JSON කරන්න මේක උදව් වෙනවා