"""Bounded, copy-then-validate changes to a ConceptWorkspace."""
import re
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field
from app.v2.workspace import Block, Compare, ConceptWorkspace, Identifier, Row, Entity, Transition, StrictModel, ViewSettings, resolve_workspace


class InspectionTarget(StrictModel):
    source_id: Identifier
    kind: Literal['pitch', 'chord', 'voicing', 'transition']
    key: Annotated[int, Field(ge=0, le=11, strict=True)] | Identifier


class EntityWrite(StrictModel):
    op: Literal['add_entity', 'update_entity']
    entity: Entity


class RelationWrite(StrictModel):
    op: Literal['add_relation', 'update_relation']
    relation: Compare | Transition


class BlockAdd(StrictModel):
    op: Literal['add_block']
    block: Block


class ViewUpdate(StrictModel):
    op: Literal['update_view']
    id: Identifier
    settings: ViewSettings


class Remove(StrictModel):
    op: Literal['remove_entity', 'remove_relation', 'remove_block']
    id: Identifier


class Recompose(StrictModel):
    op: Literal['recompose']
    composition: list[Row] = Field(max_length=12)


Operation = Annotated[EntityWrite | RelationWrite | BlockAdd | ViewUpdate | Remove | Recompose, Field(discriminator='op')]


class WorkspacePatch(StrictModel):
    protocol_version: Literal[1]
    base_version: int = Field(ge=1, strict=True)
    operations: list[Operation] = Field(min_length=1, max_length=32)


def apply_workspace_patch(workspace: ConceptWorkspace, raw: dict, user_message: str) -> ConceptWorkspace:
    patch = WorkspacePatch.model_validate(raw)
    if patch.base_version != workspace.version:
        raise ValueError('The draft changed. Ask again using the current workspace.')
    draft = workspace.model_dump()
    handles: dict[str, str] = {}
    # ponytail: deliberately narrow English action prefixes for destructive composition;
    # ambiguous phrasing is rejected, not interpreted as authority. Broaden with explicit product intent support.
    destructive = bool(re.match(r'^\s*(?:please\s+)?(?:remove|delete|reset|clear|replace|start over)\b', user_message, re.I))
    recompose = destructive or bool(re.match(r'^\s*(?:please\s+)?(?:rearrange|recompose|reorder)\b', user_message, re.I))

    def resolve(id: str) -> str:
        if id.startswith('$') and id not in handles:
            raise ValueError('A temporary reference must be created before it is used')
        return handles.get(id, id)

    for operation in patch.operations:
        if isinstance(operation, Recompose):
            if not recompose:
                raise ValueError('Rearranging existing views needs an explicit request')
            draft['composition'] = [{'items': [item.model_dump() | {'block_id': resolve(item.block_id)} for item in row.items]} for row in operation.composition]
        elif isinstance(operation, Remove):
            if not destructive:
                raise ValueError('Removing workspace content needs an explicit removal or reset request')
            collection = {'remove_entity': 'entities', 'remove_relation': 'relations', 'remove_block': 'blocks'}[operation.op]
            id = resolve(operation.id)
            if not any(obj['id'] == id for obj in draft[collection]):
                raise ValueError('The object to remove no longer exists')
            draft[collection] = [obj for obj in draft[collection] if obj['id'] != id]
            if collection == 'blocks':
                draft['composition'] = [{'items': [item for item in row['items'] if item['block_id'] != id]} for row in draft['composition']]
                draft['composition'] = [row for row in draft['composition'] if row['items']]
        elif isinstance(operation, ViewUpdate):
            block = next((b for b in draft['blocks'] if b['id'] == resolve(operation.id)), None)
            if block is None:
                raise ValueError('The view no longer exists')
            block['settings'] = operation.settings.model_dump()
        else:
            if isinstance(operation, EntityWrite):
                collection, obj = 'entities', operation.entity.model_dump()
                if obj.get('key_id'):
                    obj['key_id'] = resolve(obj['key_id'])
                if obj.get('steps'):
                    obj['steps'] = [step | {'chord_id': resolve(step['chord_id']), 'voicing_id': resolve(step['voicing_id']) if step['voicing_id'] else None} for step in obj['steps']]
                if obj.get('chord_id'):
                    obj['chord_id'] = resolve(obj['chord_id'])
            elif isinstance(operation, RelationWrite):
                collection, obj = 'relations', operation.relation.model_dump()
                obj['entity_ids'] = [resolve(id) for id in obj['entity_ids']]
                if obj.get('key_id'):
                    obj['key_id'] = resolve(obj['key_id'])
            else:
                collection, obj = 'blocks', operation.block.model_dump()
                obj['source_id'] = resolve(obj['source_id'])
            if operation.op.startswith('add_'):
                handle = obj['id']
                if not handle.startswith('$') or handle in handles:
                    raise ValueError('New objects need unique temporary handles beginning with $')
                obj['id'] = handles[handle] = uuid4().hex
                draft[collection].append(obj)
                if collection == 'blocks':
                    draft['composition'].append({'items': [{'block_id': obj['id'], 'span': 12, 'priority': 'supporting'}]})
            else:
                obj['id'] = resolve(obj['id'])
                index = next((i for i, old in enumerate(draft[collection]) if old['id'] == obj['id']), None)
                if index is None:
                    raise ValueError('The object to update no longer exists')
                draft[collection][index] = obj
    result = ConceptWorkspace.model_validate(draft)
    resolve_workspace(result)
    return result
