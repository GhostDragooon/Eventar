import ast
from pathlib import Path

_PRIV = "rag_api.privileged"


def _restricted(rel: Path) -> bool:
    dirs, name = rel.parts[:-1], rel.name
    return (
        ("routers" in dirs and name.startswith("retriev"))
        or "retrievers" in dirs
        or "user_scoped" in dirs
        or name.startswith("gate")
    )


def _dynamic_import_target(call: ast.Call) -> str:
    """The literal module name of importlib.import_module("x") / __import__("x"), else ''."""
    f = call.func
    name = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", "")
    if name in {"import_module", "__import__"} and call.args:
        a = call.args[0]
        if isinstance(a, ast.Constant) and isinstance(a.value, str):
            return a.value
    return ""


def _imports_privileged(tree: ast.AST, rel: Path) -> bool:
    pkg = ["rag_api", *rel.parts[:-1]]
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            base = node.module.split(".") if node.module else []
            if node.level:
                base = pkg[: len(pkg) - (node.level - 1)] + base
            full = ".".join(base)
            names += [full] + [f"{full}.{a.name}" for a in node.names]
        elif isinstance(node, ast.Call) and _dynamic_import_target(node):
            names.append(_dynamic_import_target(node))
    return any(n == _PRIV or n.startswith(_PRIV + ".") for n in names)


def find_boundary_violations(root: Path) -> list[str]:
    out = []
    for path in sorted(root.rglob("*.py")):
        rel = path.relative_to(root)
        if _restricted(rel) and _imports_privileged(ast.parse(path.read_text()), rel):
            out.append(f"{rel.as_posix()}: imports {_PRIV}")
    return out
