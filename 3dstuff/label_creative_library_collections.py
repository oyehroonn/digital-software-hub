#!/usr/bin/env python3
"""Rename shared-library collection folders with a clear product summary."""
from pathlib import Path

LIBRARY = Path("/Users/hico/Desktop/DSM Creative Box Library/01_DESIGNS")
SUMMARIES = {
    "Autodesk 2025 Boxes": "AutoCAD LT, 3ds Max, Alias, Arnold +13",
    "Autodesk 2027 Boxes": "3ds Max, AutoCAD, AutoCAD LT, Alias +14",
    "Boxes 1-10": "Dynamics 365, Microsoft 365, Office, Windows",
    "Loose Office 2024": "Office 2024 Professional Plus MAK",
    "Microsoft 365": "Business, Copilot, E3-E5, Teams, Power Automate",
    "Microsoft Office 2021": "Home & Business, Home & Student, Professional",
    "Microsoft Office 2024": "Home, Professional Plus, Home & Business, LTSC",
    "Microsoft Windows 10": "Pro, Enterprise, LTSC-LTSB, Home, Workstation",
    "Microsoft Windows 11 Boxes": "Home, Pro, Enterprise, LTSC, IoT",
    "New Autodesk 2026 Boxes": "3ds Max, Alias, Arnold, AutoCAD +14",
    "Previously Extracted Autodesk 2027": "3ds Max, AutoCAD, Alias, AEC +14",
    "Previously Extracted Microsoft": "Dynamics, Microsoft 365, Office, Windows",
}


def main() -> None:
    for original, summary in SUMMARIES.items():
        source = LIBRARY / original
        target = LIBRARY / f"{original} ({summary})"
        if target.exists():
            continue
        if not source.exists():
            raise SystemExit(f"Missing expected collection: {source}")
        source.rename(target)
        print(f"{original} -> {target.name}")


if __name__ == "__main__":
    main()
