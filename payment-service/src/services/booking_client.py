import httpx
from fastapi import HTTPException
from src.core.config import settings

async def validate_booking(booking_id: int):
    """Booking Service එකට කතා කරලා Booking එක ඇත්තටම තියෙනවද කියලා බලනවා"""
    
    url = f"{settings.BOOKING_SERVICE_URL}/api/bookings/{booking_id}"
    
    try:
        # Architecture රිපෝට් එකේ ඉල්ලලා තිබුණ විදිහටම තත්පර 5ක උපරිම කාලයක් (timeout) දෙනවා
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            
            # Booking එක සාර්ථකව හම්බවුනොත්
            if response.status_code == 200:
                return response.json() 
            
            # Booking එක නැත්නම් (404 Not Found)
            elif response.status_code == 404:
                raise HTTPException(status_code=400, detail=f"Booking validation failed for id: {booking_id}")
            
            # වෙනත් සර්වර් දෝෂයක් නම්
            else:
                raise HTTPException(status_code=500, detail="Error communicating with Booking Service")
                
    except httpx.RequestError:
        # Booking Service එක සම්පූර්ණයෙන්ම අක්‍රිය වෙලා (Off වෙලා) නම්
        raise HTTPException(status_code=503, detail="Booking Service is currently unavailable")