# DSM 3D Asset Cross-Check Report

_Generated 2026-07-15 11:18 · source `products.xlsx` (sheet `Products`) · flat models `public/models/`_

## Summary

| Metric | Count |
| --- | ---: |
| Product rows in workbook | 478 |
| Embedded images (anchored) | 476 |
| Products WITH an anchored image | 476 |
| Products MISSING an image | **2** |
| Rows with >1 anchored image | 0 |
| Flat `public/models/*.glb` files | 381 (34 legacy non-numeric) |
| Products WITH a flat `{id}.glb` | 347 |
| Products MISSING a GLB | **131** |
| ↳ excluding `variable` parents | **99** |

## 1. Image ↔ product mapping

Images are matched to products by **drawing anchor** (the row the picture sits on), not by the alphabetical order of the hash-named `xl/media/` files. Every anchored image lands on exactly one product row, and no row carries more than one image, so the image→(ID/SKU/Name) mapping is 1:1 and unambiguous.

No row carries more than one image. ✅

Sample of the verified mapping (first 8 products with images):

| Row | ID | SKU | Name |
| ---: | --- | --- | --- |
| 2 | 50749 |  | Chaos Corona Renderer |
| 3 | 50755 |  | Chaos Corona Renderer - Solo License |
| 4 | 50756 |  | Chaos Corona Renderer - Premium License |
| 5 | 50330 |  | Visual Studio 2026 Professional |
| 6 | 50328 |  | Visual Studio 2026 Enterprise |
| 7 | 49851 |  | Autodesk Construction Cloud – Build Better with Connect |
| 8 | 48566 |  | Chaos Enscape – Real-Time Rendering |
| 9 | 48567 |  | Chaos Enscape – Real-Time Rendering - Solo |

## 2. Products missing an image

2 product row(s) have **no** anchored image:

| Row | ID | SKU | Name |
| ---: | --- | --- | --- |
| 146 | 8507 | KLQ-00431-1-1-2 | Microsoft Office 365 E3 (5 Users) 1 Year Subscription (Copy) |
| 147 | 8577 | KLQ-00431-1-1-2 | Microsoft Office 365 E3 (5 Users) 1 Year Subscription (Copy) - 5 Users |

These rows will fall back to the untextured base box (or a placeholder) until an image is added to the workbook.

## 3. Products missing a GLB

131 product(s) have no flat `public/models/{id}.glb` (the file the site loads). Breakdown by product type:

| Type | Total | Missing GLB |
| --- | ---: | ---: |
| simple | 119 | 6 |
| variable | 93 | 93 |
| variation | 266 | 32 |

`variable` rows are catalog *parents* and are never rendered as a box on their own, so the actionable gap for Wave-3 regen is the **99 non-`variable` products** listed below (simple + variation).

<details><summary>All products missing a GLB (click to expand)</summary>

| ID | Type | SKU | Name |
| --- | --- | --- | --- |
| 8151 | simple | DSM1234 | Microsoft Windows 10 Enterprise 2021 LTSC 32/64 Bit (1P |
| 8152 | simple | ADAC2023 | AutoCad 2023 : 2D and 3D CAD Software (Yearly Subscript |
| 8153 | simple | DSM062 | Microsoft 365 E3 1 Year Subscription for 100 users |
| 8154 | simple | DSM0066 | Microsoft Windows Server 2016 Standard (16 Core) |
| 8172 | simple | DSM101 | Microsoft Windows 10 Pro for Workstation |
| 8178 | simple |  | Office 365 Enterprise E3 (5 Users) 1 Year Subscription |
| 48566 | variable |  | Chaos Enscape – Real-Time Rendering |
| 50749 | variable |  | Chaos Corona Renderer |
| 8155 | variable | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals |
| 8156 | variable | DSM0064 | Microsoft Windows Server 2019 RDS User Cals |
| 8159 | variable | DSM0057 | Microsoft Windows Server 2022 User Cal License |
| 8164 | variable | ADAC2022 | AutoCad 2022 : 2D and 3D CAD Software (Yearly Subscript |
| 8240 | variable | DSM067 | Microsoft Windows Server 2022 Remote Desktop - User Cal |
| 8241 | variable | DSM066 | Microsoft Windows Server 2022 Remote Desktop Device Cal |
| 8245 | variable | DSM061 | Microsoft Windows Server 2019  User Cal |
| 8356 | variable | ADRT2023 | Revit 2023: BIM software for designers, builders and do |
| 8357 | variable | ADRT2022 | Revit 2022 : BIM software for designers, builders and d |
| 8359 | variable |  | AutoCAD LT 2023 : Best-in-class 2D design and documenta |
| 8360 | variable |  | AutoCAD LT 2022 : Best-in-class 2D design and documenta |
| 8361 | variable |  | Maya 2023 : Create expansive worlds, complex characters |
| 8362 | variable |  | Maya 2022 : Create expansive worlds, complex characters |
| 8363 | variable |  | Inventor 2023 : Powerful mechanical design software for |
| 8364 | variable |  | Inventor 2022 : Powerful mechanical design software for |
| 8365 | variable |  | 3ds Max 2023 : Create massive worlds and high-quality d |
| 8366 | variable |  | 3ds Max 2022 : Create massive worlds and high-quality d |
| 8367 | variable |  | Civil 3D 2023 : Comprehensive detailed design and docum |
| 8368 | variable |  | Civil 3D 2022 : Comprehensive detailed design and docum |
| 8369 | variable |  | Fusion 360 : Unify design, engineering, electronics and |
| 8373 | variable | ADAC2024 | AutoCad 2024 : Trusted by millions, built to accelerate |
| 8374 | variable | ADRT2023-1 | Revit 2024: BIM software to design and make anything (Y |
| 8375 | variable |  | Maya 2024 : Create expansive worlds, complex characters |
| 8376 | variable |  | Civil 3D 2024 : Comprehensive detailed design and docum |
| 8377 | variable |  | 3ds Max 2024 : Create massive worlds and high-quality d |
| 8378 | variable |  | Inventor 2024 : Mechanical design software for ambitiou |
| 8379 | variable |  | AutoCAD LT 2024 : Best-in-class 2D design with automati |
| 8380 | variable | KLQ-00431 | Microsoft 365 Business Premium 1 Year Subscription |
| 8383 | variable | KLQ-00431-1-2-1 | Microsoft 365 E5 1 Year Subscription |
| 8387 | variable | DSM067-1 | Microsoft Windows Server 2025 Remote Desktop - User Cal |
| 8388 | variable | DSM066-1 | Microsoft Windows Server 2025 Remote Desktop Device Cal |
| 8390 | variable | DSM0057-1 | Microsoft Windows Server 2025 User Cals |
| 8391 | variable |  | Civil 3D 2023 : Comprehensive detailed design and docum |
| 8392 | variable |  | Fusion 360 2025 : Unify design, engineering, electronic |
| 8472 | variable | ADAC2024-1 | AutoCad 2025 : Trusted by millions, built to accelerate |
| 8473 | variable |  | Inventor 2025 : Mechanical design software for ambitiou |
| 8474 | variable |  | 3ds Max 2025 : Create massive worlds and high-quality d |
| 8475 | variable |  | AutoCAD LT 2025 : Best-in-class 2D design with automati |
| 8476 | variable |  | Maya 2025 : Create expansive worlds, complex characters |
| 8477 | variable |  | Civil 3D 2025 : Comprehensive detailed design and docum |
| 8478 | variable | ADRT2023-1-1 | Revit 2025: BIM software to design and make anything (Y |
| 8479 | variable | ADRT2023-1-1-1 | Navisworks 2025: Comprehensive project review software  |
| 8480 | variable | ADRT2023-1-1-1-1 | Navisworks 2023: Comprehensive project review software  |
| 8481 | variable | ADRT2023-1-1-1-2 | Navisworks 2024: Comprehensive project review software  |
| 8482 | variable | DSM0057-1-1 | Dynamics 365 Business Central Premium |
| 8483 | variable | DSM0057-1-1-8 | Microsoft Power BI PRO |
| 8484 | variable | DSM0057-1-1-8-1 | Microsoft Power BI Premium |
| 8485 | variable | DSM0057-1-1-8-2 | Microsoft Project Online Project Plan 5 |
| 8486 | variable |  | Dynamics 365 Business Central Premium |
| 8487 | variable |  | Microsoft Dynamics 365 Sales Enterprise |
| 8488 | variable |  | Dynamics 365 Finance |
| 8489 | variable |  | Dynamics 365 Customer Service Enterprise |
| 8490 | variable |  | Dynamics 365 Human Resources |
| 8491 | variable |  | Dynamics 365 Marketing (Base Pack) |
| 8492 | variable |  | Dynamics 365 Project Operations |
| 8493 | variable |  | Dynamics 365 Customer Insights |
| 8494 | variable |  | Architecture, Engineering & Construction (AEC) Collecti |
| 8495 | variable |  | Architecture, Engineering & Construction (AEC) Collecti |
| 8497 | variable |  | Autodesk Product Design & Manufacturing Collection 2025 |
| 8498 | variable |  | Autodesk Media & Entertainment (MEC) Collection 2024 |
| 8499 | variable |  | Autodesk Media & Entertainment (MEC) Collection 2025 |
| 8507 | variable | KLQ-00431-1-1-2 | Microsoft Office 365 E3 (5 Users) 1 Year Subscription ( |
| 8511 | variable |  | Autodesk InfoDrainage: Create detailed drainage designs |
| 8512 | variable |  | InfraWorks: Model building and infrastructure design co |
| 8513 | variable |  | Microsoft 365 Education A5 |
| 8586 | variable |  | SketchUp Free – 3D Design Without Boundaries |
| 8686 | variable |  | 3ds Max 2026 : Create massive worlds and high-quality d |
| 8690 | variable |  | Navisworks 2026: Comprehensive project review software  |
| 8694 | variable |  | Maya 2026 : Create expansive worlds, complex characters |
| 8698 | variable |  | Revit 2026: BIM software to design and make anything (Y |
| 8702 | variable |  | Civil 3D 2026 : Comprehensive detailed design and docum |
| 8706 | variable |  | Architecture, Engineering &amp; Construction (AEC) Coll |
| 8710 | variable |  | AutoCAD LT 2026 : Best-in-class 2D design with automati |
| 8714 | variable |  | Fusion 360 2026 : Unify design, engineering, electronic |
| 8721 | variable |  | AutoCad 2026 : Trusted by millions, built to accelerate |
| 8731 | variable |  | Inventor 2026 : Mechanical design software for ambitiou |
| 8742 | variable |  | Autodesk Product Design &amp; Manufacturing Collection  |
| 8769 | variable |  | Autodesk Media &amp; Entertainment (MEC) Collection 202 |
| 8773 | variable |  | Fabrication Software 2026 That Drives Precision from De |
| 8832 | variable |  | Autodesk Mudbox 2026 |
| 8836 | variable |  | Autodesk Alias 2026 – Shape the Future of Product Desig |
| 8951 | variable |  | Autodesk Arnold 2026 – Advanced Global Illumination Ren |
| 8955 | variable |  | Autodesk Flame 2026: Ignite every story from start to f |
| 8961 | variable |  | V-Ray 3D Rendering Software by Chaos |
| 8979 | variable |  | Microsoft Office 2024 Standard LTSC MAK – Multi-User Li |
| 9009 | variable |  | Microsoft Office 2024 Professional Plus MAK - Multi-Use |
| 9016 | variable |  | Microsoft Windows 11 Professional MAK License |
| 9031 | variable |  | Microsoft Windows 10 Professional MAK Key (20/150/2500/ |
| 9044 | variable |  | SketchUp – The 3D Modeling Software |
| 9091 | variable |  | Autodesk Product Design &amp; Manufacturing Collection  |
| 9113 | variable |  | Microsoft Visio Plan 2 – Professional Diagramming Made  |
| 8201 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 5-user- |
| 8202 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 50-user |
| 8203 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 45-user |
| 8204 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 40-user |
| 8205 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 35-user |
| 8206 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 30-user |
| 8207 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 25-user |
| 8208 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 20-user |
| 8209 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 15-user |
| 8210 | variation | DSM0065 | Microsoft Windows Server 2019 RDS Device Cals - 10-user |
| 8211 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 50-user-c |
| 8212 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 45-user-c |
| 8213 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 40-user-c |
| 8214 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 35-user-c |
| 8215 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 30-user-c |
| 8216 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 25-user-c |
| 8217 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 20-user-c |
| 8218 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 15-user-c |
| 8219 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 10-user-c |
| 8220 | variation | DSM0064 | Microsoft Windows Server 2019 RDS User Cals - 5-user-ca |
| 8221 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 50 |
| 8222 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 45 |
| 8223 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 40 |
| 8224 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 35 |
| 8225 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 30 |
| 8226 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 25 |
| 8227 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 20 |
| 8228 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 15 |
| 8229 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 10 |
| 8230 | variation | DSM0057 | Microsoft Windows Server 2022 User Cal License - 5 |
| 8231 | variation | ADAC2022 | AutoCad 2022 : 2D and 3D CAD Software (Yearly Subscript |
| 8232 | variation | ADAC2022 | AutoCad 2022 : 2D and 3D CAD Software (Yearly Subscript |
</details>
