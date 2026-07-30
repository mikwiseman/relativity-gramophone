#!/usr/bin/env python3
"""Assemble the round-1 debate packet from all landed proposals."""
import glob
import os

PANEL = os.path.dirname(os.path.abspath(__file__))
ROLES = ["astronomer", "designer", "product", "engineer", "dreamer"]
ROLE_RU = {
    "astronomer": "АСТРОНОМ",
    "designer": "ДИЗАЙНЕР",
    "product": "ПРОДУКТ",
    "engineer": "ИНЖЕНЕР",
    "dreamer": "МЕЧТАТЕЛЬ",
}
SOURCES = [("internal", "ВНУТРЕННИЙ АГЕНТ"), ("claude", "CLAUDE/fable"), ("codex", "CODEX/gpt-5.6-sol@xhigh")]

def read(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    with open(path, errors="replace") as handle:
        return handle.read().strip()

out = []
out.append("# ДЕБАТНЫЙ ПАКЕТ — раунд 1 завершён\n")
out.append("15 агентов (5 ролей × 3 платформы) ответили на один вопрос панели.")
out.append("Ниже — все предложения с атрибуцией, затем замечания оркестратора,")
out.append("затем все вопросы ролей друг другу.\n")

landed = 0
for role in ROLES:
    for source, label in SOURCES:
        text = read(os.path.join(PANEL, f"r1-{source}-{role}.md"))
        if text is None:
            continue
        landed += 1
        out.append(f"\n---\n\n## [{label} · {ROLE_RU[role]}]\n")
        out.append(text)

out.append(f"\n---\n\n## [ОРКЕСТРАТОР — замечания до дебата]\n")
out.append(read(os.path.join(PANEL, "note-orchestrator.md")) or "")

packet = "\n".join(out)
with open(os.path.join(PANEL, "DEBATE.md"), "w") as handle:
    handle.write(packet)
print(f"landed {landed}/15, packet {len(packet)} chars")
