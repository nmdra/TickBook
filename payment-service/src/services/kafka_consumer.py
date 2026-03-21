import json
import asyncio
from aiokafka import AIOKafkaConsumer
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.logger import logger

from src.core.config import settings
from src.core.database import async_session_maker
from src.models.payment import Payment

async def process_booking_event(event_data: dict, db: AsyncSession):
    """Kafka එකෙන් එන පණිවිඩය කියවලා Database එකට දාන කොටස"""
    
    # මෙතන තමයි අපි අර පරණ Node.js වල තිබුණු Bug එක හදන්නේ!
    # අපි nested 'data' එකක් හොයන්නේ නැතුව, කෙලින්ම flat fields ටික ගන්නවා.
    event_type = event_data.get("event_type")
    
    if event_type == "booking.created":
        booking_id = event_data.get("booking_id")
        user_id = event_data.get("user_id")
        amount = event_data.get("amount")
        
        # දත්ත ටික හරියටම ඇවිත් නම් Payment එකක් හදනවා
        if booking_id and user_id and amount is not None:
            new_payment = Payment(
                booking_id=booking_id,
                user_id=user_id,
                amount=amount,
                status="pending",
                payment_method="pending_selection"
            )
            db.add(new_payment)
            await db.commit()
            print(f"✅ Successfully created pending payment for Booking ID: {booking_id}")
        else:
            print("❌ Invalid event data: Missing required fields")

async def consume_kafka_messages():
    """Kafka එකට කන් දීගෙන (Listen) ඉන්න ප්‍රධාන ලූප් එක (Loop)"""
    
    # අලුත් Consumer කෙනෙක් හදනවා
    consumer = AIOKafkaConsumer(
        'bookings', # සවන් දෙන්නේ bookings කියන topic එකට
        bootstrap_servers='localhost:9092', # අන්තර්ජාලයෙන් නම් 9092, Docker ඇතුළෙන් නම් 29092
        group_id='payment-service', # අපේ Group එකේ නම
        auto_offset_reset='earliest' # මුල ඉඳන්ම ආපු පණිවිඩ අල්ලගන්නවා
    )
    
    # Kafka එකට Connect වෙනවා (Connect වෙන්න බැරි වුනොත් ට්‍රයි කරනවා)
    connected = False
    while not connected:
        try:
            await consumer.start()
            connected = True
            print("🎧 Kafka Consumer started successfully. Listening to 'bookings' topic...")
        except Exception as e:
            print(f"⚠️ Could not connect to Kafka. Retrying in 5 seconds... ({e})")
            await asyncio.sleep(5)

    try:
        # දිගටම ඇහෙන ඇහෙන පණිවිඩේ අරන් process කරනවා
        async for msg in consumer:
            try:
                # පණිවිඩය (JSON) කියවනවා
                event_data = json.loads(msg.value.decode('utf-8'))
                print(f"📩 Received Kafka Event: {event_data.get('event_type')}")
                
                # Database එකට ලොග් වෙලා අර උඩින් ලියපු Function එකට දත්ත යවනවා
                async with async_session_maker() as session:
                    await process_booking_event(event_data, session)
                    
            except json.JSONDecodeError:
                print("❌ Failed to decode JSON message from Kafka")
            except Exception as e:
                print(f"❌ Error processing message: {e}")
    finally:
        # වැඩසටහන නවත්වද්දී Kafka එකත් ලස්සනට නවත්වනවා
        await consumer.stop()