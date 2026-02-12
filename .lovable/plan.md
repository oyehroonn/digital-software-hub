
# DSM – Digital Software Market | React Frontend

## Overview
Replicate the existing luxury editorial HTML design pixel-for-pixel into a modular React + Tailwind CSS frontend. The site is a premium software licensing marketplace (official Microsoft/Adobe/Autodesk partner) with a high-end, Porsche/Apple-inspired aesthetic using Playfair Display + Inter fonts, stone color palette, and smooth scroll-triggered animations.

---

## Pages & Sections to Build

### 1. Homepage (Landing Page)
All sections from the HTML, built as reusable React components:

- **Fixed Navigation Header** – Logo "DSM.", desktop menu with mega-menu dropdown on "Software" (categories, partner showroom, editorial feature card), links for Enterprise/Support/About, icon buttons for Search/User/Cart with cart badge
- **Hero Section** – Full-viewport with background image overlay, trust badge ("Official Certified Reseller"), large serif headline ("Digital Architecture For Creators"), subheadline, two CTAs (Shop Licenses + Talk to a Specialist), trust indicators (Genuine, Instant Delivery, Lifetime Warranty), scroll-down indicator
- **Logo Strip** – Monochrome partner logos (Microsoft, Apple, Autodesk, Adobe, SketchUp, V-Ray) with grayscale-to-color hover effect
- **Curated by Role (Bento Grid)** – 4-item asymmetric grid: Enterprise & IT (large), Creative Studio, AEC & BIM, Education (dark card with icon)
- **Editorial Spotlight (Dark Section)** – Windows 11 Professional feature with pricing (AED 199), product visual with gradient background and Windows logo, "Configure License" CTA
- **Bestselling Essentials (Product Grid)** – 4 product cards with hover-reveal "Add to Cart" overlays, badges (Best Value, Sale), pricing in AED, filter tabs (All/Office/Security/Design)
- **Trust Section** – "Why companies trust DSM" with 4 feature cards: Certified Authenticity, Instant Delivery, Technical Support, Secure Transactions
- **Footer** – 4-column layout (Brand + socials, Shop links, Support links, Legal links), payment method badges (VISA/MC/AMEX), copyright

### 2. Visual Effects & Interactions
- **Film grain overlay** – Subtle SVG noise texture fixed overlay
- **Scroll-triggered animations** – Fade-up, fade-right, and scale-in animations on scroll (using CSS animations/Intersection Observer to replace GSAP)
- **Mega menu** – Smooth open/close on hover with backdrop blur
- **Product card hover** – Slide-up overlay with "Add to Cart" button
- **Custom scrollbar** – Thin 6px styled scrollbar
- **Floating chat button** – Fixed bottom-right "Chat with Expert" button that expands on hover

### 3. Design System Setup
- **Fonts**: Playfair Display (serif headings) + Inter (UI text) via Google Fonts
- **Colors**: Stone palette (stone-50 through stone-900), cobalt blue accent, green for status indicators
- **Typography**: Editorial large serif headlines, light-weight body text, uppercase tracking for labels
- **Spacing**: Max-width 1600px container, generous padding (py-24 to py-32 sections)

### 4. Component Architecture
Modular, reusable components ready for future pages:
- `Header` with `MegaMenu` sub-component
- `Hero`
- `LogoStrip`
- `RoleGrid` (Bento layout)
- `EditorialSpotlight`
- `ProductCard` + `ProductGrid`
- `TrustSection`
- `Footer`
- `FloatingChatButton`
- `GrainOverlay`

All components will be fully responsive (mobile hamburger menu pattern for navigation, stacked layouts on small screens) matching the existing HTML breakpoints.
