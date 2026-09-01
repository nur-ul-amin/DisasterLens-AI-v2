import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
try:
    from geoalchemy2 import Geometry
    from geoalchemy2.shape import to_shape
    from shapely.geometry import Point
except (ImportError, AttributeError):
    pass

# Get DATABASE_URL from environment variables (Default to local SQLite if missing)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./disasterlens.db")

# Fix for Heroku/Supabase legacy "postgres://" URLs (SQLAlchemy 1.4+ requires "postgresql://")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Configure database engine arguments
engine_kwargs = {}

if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
elif DATABASE_URL.startswith("postgresql"):
    # Disable prepared statements for Supabase PgBouncer/Transaction Pooler (Port 6543)
    engine_kwargs["prepared_statement_cache_size"] = 0

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Attempt to load SpatiaLite extension if using SQLite locally
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def load_spatialite(dbapi_conn, connection_record):
        try:
            dbapi_conn.enable_load_extension(True)
            dbapi_conn.execute('SELECT load_extension("mod_spatialite")')
            dbapi_conn.execute('SELECT InitSpatialMetaData(1);')
        except Exception as e:
            print(f"[Warning] Could not load mod_spatialite: {e}")
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, index=True)
    source = Column(String, default="PWA") # 'PWA' or 'SocialMedia'
    raw_text = Column(String, nullable=True)
    
    # Standard spatial geometry column (Point, WGS84)
    geom = Column(String)
    
    latitude = Column(Float)
    longitude = Column(Float)
    
    water_depth = Column(String)
    passability_type = Column(String)
    urgency_score = Column(Float)
    verified_status = Column(Boolean, default=False)
    image_url = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_geojson(self):
        """Helper to serialize this ORM model to a GeoJSON Feature."""
        return {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [self.longitude, self.latitude]
            },
            "properties": {
                "id": self.id,
                "source": self.source,
                "raw_text": self.raw_text,
                "water_depth": self.water_depth,
                "passability_type": self.passability_type,
                "urgency_score": self.urgency_score,
                "verified_status": self.verified_status,
                "image_url": self.image_url,
                "source_url": self.source_url,
                "created_at": self.created_at.isoformat() if self.created_at else None
            }
        }

class AggregatedEvent(Base):
    """
    Persistent log of all fetched and clustered events for historical export.
    """
    __tablename__ = "aggregated_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cluster_id = Column(String, index=True)
    title = Column(String)
    category = Column(String, index=True)
    location_name = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    trust_score = Column(Float)
    trust_label = Column(String)
    published_at = Column(DateTime(timezone=True))
    fetched_date = Column(DateTime(timezone=True), index=True)
    source_refs_json = Column(String)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create tables in PostgreSQL/SQLite
Base.metadata.create_all(bind=engine)
