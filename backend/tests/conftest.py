from unittest.mock import MagicMock


def make_supabase_chain(data: list) -> MagicMock:
    """A mock Supabase query chain: .select().eq().order().insert().update().delete().upsert().execute().data"""
    chain = MagicMock()
    execute_result = MagicMock()
    execute_result.data = data
    chain.execute.return_value = execute_result
    for method in ("select", "eq", "order", "insert", "update", "delete", "upsert"):
        getattr(chain, method).return_value = chain
    return chain
