"""Local, trusted component guidance, discovered without inflating each turn."""
from pathlib import Path
from langchain_core.tools import tool
from app.v2.presentation import CAPABILITIES

SKILL_DIRECTORY = Path(__file__).with_name('component_skills')


def component_catalog(workspace: str) -> list[dict]:
    result = []
    for identifier in [*CAPABILITIES[workspace], 'practice-controls']:
        text = (SKILL_DIRECTORY / f'{identifier}.md').read_text()
        summary = next(line.removeprefix('summary: ') for line in text.splitlines() if line.startswith('summary: '))
        result.append({'id': identifier, 'summary': summary})
    return result


def component_skill_tools(workspace: str):
    catalog = component_catalog(workspace)
    allowed = {entry['id'] for entry in catalog}

    @tool
    def list_component_skills() -> list[dict]:
        """Discover trusted musical components available in the current workspace."""
        return catalog

    @tool
    def read_component_skill(id: str) -> dict:
        """Read pedagogical guidance, interactions and config for one available component."""
        if id not in allowed:
            return {'error': 'Unknown component for this workspace'}
        return {'id': id, 'instructions': (SKILL_DIRECTORY / f'{id}.md').read_text(),
                'allowed_config': list(CAPABILITIES[workspace].get(id, ('', ()))[1])}

    return [list_component_skills, read_component_skill]
