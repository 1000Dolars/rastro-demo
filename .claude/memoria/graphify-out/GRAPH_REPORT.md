# Graph Report - memoria  (2026-11-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 31 nodes · 31 edges · 4 communities (2 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.6)
- Token cost: 40,149 input · 305 output

## Graph Freshness
- Built from commit: `51163626`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Rastro UI Design Decisions
- Public Demo Repository
- Rastro Private Repository
- Project Memory Automation

## God Nodes (most connected - your core abstractions)
1. `Turno 2026-11-07 08:35:12` - 21 edges
2. `rastro-demo (repo público)` - 9 edges
3. `Rastro (repo privado)` - 3 edges
4. `Memoria del proyecto 2026-11-07` - 2 edges
5. `Pendiente C13` - 1 edges
6. `Pendiente C14` - 1 edges
7. `Pendiente C5` - 1 edges
8. `Pendiente C6` - 1 edges
9. `Pendiente C7` - 1 edges
10. `D1: Leer métricas en Ctrl+K` - 1 edges

## Surprising Connections (you probably didn't know these)
- `rastro-demo (repo público)` --shares_data_with--> `Rastro (repo privado)`  [INFERRED]
  2026-11-07.md → 2026-11-07.md  _Bridges community 1 → community 2_
- `Memoria del proyecto 2026-11-07` --conceptually_related_to--> `Turno 2026-11-07 08:35:12`  [EXTRACTED]
  2026-11-07.md → 2026-11-07.md  _Bridges community 0 → community 3_
- `Turno 2026-11-07 08:35:12` --references--> `Rastro (repo privado)`  [EXTRACTED]
  2026-11-07.md → 2026-11-07.md  _Bridges community 0 → community 2_
- `Turno 2026-11-07 08:35:12` --references--> `rastro-demo (repo público)`  [EXTRACTED]
  2026-11-07.md → 2026-11-07.md  _Bridges community 0 → community 1_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Pendientes abiertos tras el turno del 2026-11-07** — 2026_11_07_c5, 2026_11_07_c6, 2026_11_07_c7, 2026_11_07_c13, 2026_11_07_c14, 2026_11_07_tarjeta_github_ahora [EXTRACTED 1.00]
- **Suites de pruebas ejecutadas o no ejecutadas en el turno** — 2026_11_07_tests_unitarias, 2026_11_07_tests_visuales, 2026_11_07_tests_electron [EXTRACTED 1.00]

## Communities (4 total, 2 thin omitted)

### Community 0 - "Rastro UI Design Decisions"
Cohesion: 0.11
Nodes (19): Pendiente C13, Pendiente C14, Pendiente C5, Pendiente C6, Pendiente C7, D1: Leer métricas en Ctrl+K, D2 (sin cambios), D3 (sin cambios) (+11 more)

### Community 1 - "Public Demo Repository"
Cohesion: 0.25
Nodes (8): Commit 5116362 (rastro-demo, público), Carpeta estilos, Carpeta fuentes, GitHub Pages, index.html, Carpeta js, rastro-demo (repo público), Carpeta shared

## Knowledge Gaps
- **27 isolated node(s):** `Pendiente C13`, `Pendiente C14`, `Pendiente C5`, `Pendiente C6`, `Pendiente C7` (+22 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 27 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Turno 2026-11-07 08:35:12` connect `Rastro UI Design Decisions` to `Public Demo Repository`, `Rastro Private Repository`, `Project Memory Automation`?**
  _High betweenness centrality (0.894) - this node is a cross-community bridge._
- **What connects `Pendiente C13`, `Pendiente C14`, `Pendiente C5` to the rest of the system?**
  _27 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rastro UI Design Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Why does `rastro-demo (repo público)` connect `Public Demo Repository` to `Rastro UI Design Decisions`, `Rastro Private Repository`?**
  _High betweenness centrality (0.418) - this node is a cross-community bridge._
- **Why does `Rastro (repo privado)` connect `Rastro Private Repository` to `Rastro UI Design Decisions`, `Public Demo Repository`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._