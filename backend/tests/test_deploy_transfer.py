import importlib.util
from pathlib import Path
from datetime import datetime, timezone
import pytest
from sqlalchemy import create_engine, select, func
from app.database import Base
from app.models import User, Item, ChatTurn, DEV_USER_ID
spec=importlib.util.spec_from_file_location('transfer',Path(__file__).resolve().parents[2]/'scripts/migrate_to_neon.py')
transfer=importlib.util.module_from_spec(spec);spec.loader.exec_module(transfer)


def test_transfer_preserves_owner_and_data_and_refuses_overwrite():
    source=create_engine('sqlite://');target=create_engine('sqlite://')
    Base.metadata.create_all(source);Base.metadata.create_all(target)
    with source.begin() as c:
        c.execute(User.__table__.insert(),{'id':DEV_USER_ID,'display_name':'Owner','email':'owner@example.com','password_hash':'existing-hash'})
        c.execute(Item.__table__.insert(),{'id':'item','user_id':DEV_USER_ID,'text':'cane','meaning':'سگ','kind':'word','level':'A1'})
        c.execute(ChatTurn.__table__.insert(),{'id':'chat','user_id':DEV_USER_ID,'channel':'tutor','text':'ciao','response':{'reply':'Ciao!'},'created_at':datetime.now(timezone.utc)})
    with target.begin() as c:c.execute(User.__table__.insert(),{'id':DEV_USER_ID,'display_name':'Development user'})
    with source.connect() as src,target.begin() as dst:
        counts=transfer.copy_snapshot(src,dst,Base.metadata.sorted_tables)
        assert counts['items']==1 and counts['chat_turns']==1
        assert dst.scalar(select(User.password_hash))=='existing-hash'
    with source.connect() as src,target.begin() as dst:
        with pytest.raises(ValueError,match='already has application data'):transfer.copy_snapshot(src,dst,Base.metadata.sorted_tables)
        assert dst.scalar(select(func.count()).select_from(Item))==1
    with source.connect() as c:assert c.scalar(select(func.count()).select_from(Item))==1
