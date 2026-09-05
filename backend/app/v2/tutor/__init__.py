"""V2 stateless tutor (ticket #13): a fresh ReAct-style agent execution
constructed from durable Branch/Artifact/message state on every request,
run once, then discarded. See docs/agents/v2-schema.sql and app/v2/models.py
(TutorMessage) for the durable memory this reconstructs, and
app.v2.tutor.runner.run_tutor_turn for the entrypoint.
"""
