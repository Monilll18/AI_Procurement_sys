"""
Comprehensive Seed Script — populates ALL models with realistic procurement data.
Run:  python seed.py          (first seed)
Run:  python seed.py --reset  (wipe + re-seed)

Seeds: 10 Suppliers · 25 Products · 25 Inventory · 50 Purchase Orders
       Approvals · Budgets · SupplierPrices · Notifications · AuditLogs
       DemandForecasts · 5 Users with env-based role mapping
"""
import sys, os, random, uuid, argparse
from datetime import datetime, date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

from app.database import engine, SessionLocal, Base
from app.models.product import Product
from app.models.supplier import Supplier, SupplierStatus
from app.models.inventory import Inventory
from app.models.purchase_order import PurchaseOrder, POLineItem, POStatus
from app.models.approval import Approval, ApprovalStatus
from app.models.supplier_price import SupplierPrice
from app.models.budget import Budget
from app.models.notification import Notification
from app.models.audit_log import AuditLog
from app.models.demand_forecast import DemandForecast
from app.models.user import User, UserRole

random.seed(42)  # Reproducible data

# ─── Parse args ────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--reset", action="store_true", help="Drop all tables and re-seed")
args = parser.parse_args()


def seed():
    if args.reset:
        print("🗑️  Dropping all tables...")
        Base.metadata.drop_all(bind=engine)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(Product).first()
        if existing and not args.reset:
            print("⚠️  Database already has data. Run with --reset to re-seed.")
            return

        print("🌱 Seeding database with comprehensive demo data...\n")

        # ═══════════════════════════════════════════════════════════════
        # 1. USERS — 5 team members with env-aware roles
        # ═══════════════════════════════════════════════════════════════
        users_data = [
            {"clerk_id": "seed_admin",    "email": os.getenv("ADMIN_EMAILS", "admin@procureai.com").split(",")[0].strip(),
             "full_name": "Monil Jain (Admin)", "role": UserRole.admin.value, "department": "IT", "approval_limit": 999999},
            {"clerk_id": "seed_manager",  "email": os.getenv("MANAGER_EMAILS", "manager@procureai.com").split(",")[0].strip(),
             "full_name": "Sarah Chen", "role": UserRole.manager.value, "department": "Operations", "approval_limit": 50000},
            {"clerk_id": "seed_officer",  "email": os.getenv("OFFICER_EMAILS", "officer@procureai.com").split(",")[0].strip(),
             "full_name": "Mike Johnson", "role": UserRole.procurement_officer.value, "department": "Procurement", "approval_limit": 10000},
            {"clerk_id": "seed_finance", "email": os.getenv("FINANCE_EMAILS", "finance@procureai.com").split(",")[0].strip(),
             "full_name": "Lisa Park", "role": UserRole.approver.value, "department": "Finance", "approval_limit": 100000},
            {"clerk_id": "seed_viewer",   "email": "viewer@procureai.com",
             "full_name": "Tom Wilson", "role": UserRole.viewer.value, "department": "Management", "approval_limit": 0},
        ]

        users = []
        for u in users_data:
            user = User(**u, is_active=True)
            db.add(user)
            users.append(user)
        db.flush()
        print(f"  ✅ Created {len(users)} users (admin, manager, officer, finance, viewer)")

        # ═══════════════════════════════════════════════════════════════
        # 2. SUPPLIERS — 10 global suppliers
        # ═══════════════════════════════════════════════════════════════
        suppliers_data = [
            {"name": "TechCore Components",   "email": "sales@techcore.com",       "phone": "+1-555-0101", "address": "1200 Innovation Drive, Austin, TX 78701",          "rating": 4.8, "status": SupplierStatus.active},
            {"name": "Global Parts Ltd",      "email": "orders@globalparts.co",    "phone": "+44-20-7946-0958", "address": "45 Commerce St, London EC2A 4BQ, UK",         "rating": 4.5, "status": SupplierStatus.active},
            {"name": "Pacific Supply Co",     "email": "info@pacificsupply.com",   "phone": "+1-555-0202", "address": "890 Harbor Blvd, San Francisco, CA 94107",         "rating": 4.2, "status": SupplierStatus.active},
            {"name": "EuroTrade GmbH",        "email": "kontakt@eurotrade.de",     "phone": "+49-30-1234567", "address": "Berliner Str. 42, 10115 Berlin, Germany",       "rating": 4.6, "status": SupplierStatus.active},
            {"name": "Apex Industrial",       "email": "procurement@apexind.com",  "phone": "+1-555-0303", "address": "2500 Factory Lane, Chicago, IL 60614",             "rating": 3.5, "status": SupplierStatus.active},
            {"name": "SilkRoad Materials",    "email": "sourcing@silkroad.cn",     "phone": "+86-21-5555-1234", "address": "88 Nanjing Road, Shanghai 200001, China",     "rating": 4.1, "status": SupplierStatus.active},
            {"name": "Nordic Supplies AB",    "email": "order@nordicsupplies.se",  "phone": "+46-8-555-1234", "address": "Kungsgatan 12, 111 43 Stockholm, Sweden",       "rating": 4.7, "status": SupplierStatus.active},
            {"name": "Delta Electronics Corp","email": "sales@deltaelec.com",      "phone": "+1-555-0404", "address": "700 Tech Park, Dallas, TX 75201",                  "rating": 3.2, "status": SupplierStatus.inactive},
            {"name": "Pinnacle Metals",       "email": "inquiry@pinnaclemetals.com","phone": "+1-555-0505", "address": "1500 Steel Ave, Pittsburgh, PA 15219",             "rating": 4.3, "status": SupplierStatus.active},
            {"name": "Quantum Optics Inc",    "email": "sales@quantumoptics.com",  "phone": "+1-555-0606", "address": "300 Laser Way, Tucson, AZ 85701",                  "rating": 4.9, "status": SupplierStatus.active},
        ]

        suppliers = []
        for s in suppliers_data:
            supplier = Supplier(**s)
            db.add(supplier)
            suppliers.append(supplier)
        db.flush()
        print(f"  ✅ Created {len(suppliers)} suppliers")

        # ═══════════════════════════════════════════════════════════════
        # 3. PRODUCTS — 25 items across 10 categories
        # ═══════════════════════════════════════════════════════════════
        products_data = [
            {"sku": "COMP-CPU-001", "name": "Intel Core i9-14900K",      "category": "Computing",    "unit": "pcs", "reorder_point": 15, "reorder_quantity": 50},
            {"sku": "COMP-RAM-001", "name": "DDR5 32GB Module",          "category": "Computing",    "unit": "pcs", "reorder_point": 25, "reorder_quantity": 100},
            {"sku": "COMP-SSD-001", "name": "NVMe SSD 1TB",             "category": "Computing",    "unit": "pcs", "reorder_point": 20, "reorder_quantity": 80},
            {"sku": "NET-SWT-001",  "name": "48-Port Managed Switch",   "category": "Networking",   "unit": "pcs", "reorder_point": 5,  "reorder_quantity": 20},
            {"sku": "NET-CBL-001",  "name": "Cat6a Cable 305m Box",     "category": "Networking",   "unit": "box", "reorder_point": 10, "reorder_quantity": 30},
            {"sku": "PWR-UPS-001",  "name": "2000VA Smart UPS",         "category": "Power",        "unit": "pcs", "reorder_point": 8,  "reorder_quantity": 25},
            {"sku": "PWR-PSU-001",  "name": "850W Modular PSU",         "category": "Power",        "unit": "pcs", "reorder_point": 15, "reorder_quantity": 50},
            {"sku": "SEC-CAM-001",  "name": "4K Security Camera",       "category": "Security",     "unit": "pcs", "reorder_point": 12, "reorder_quantity": 40},
            {"sku": "SEC-NVR-001",  "name": "32-Channel NVR",           "category": "Security",     "unit": "pcs", "reorder_point": 3,  "reorder_quantity": 10},
            {"sku": "SRV-CHS-001",  "name": "2U Server Chassis",        "category": "Servers",      "unit": "pcs", "reorder_point": 5,  "reorder_quantity": 15},
            {"sku": "SRV-MB-001",   "name": "Dual Xeon Motherboard",    "category": "Servers",      "unit": "pcs", "reorder_point": 8,  "reorder_quantity": 20},
            {"sku": "STR-HDD-001",  "name": "4TB Enterprise HDD",       "category": "Storage",      "unit": "pcs", "reorder_point": 20, "reorder_quantity": 60},
            {"sku": "STR-NAS-001",  "name": "8-Bay NAS Enclosure",      "category": "Storage",      "unit": "pcs", "reorder_point": 4,  "reorder_quantity": 12},
            {"sku": "DSP-MON-001",  "name": '27" 4K IPS Monitor',       "category": "Display",      "unit": "pcs", "reorder_point": 10, "reorder_quantity": 30},
            {"sku": "DSP-PRJ-001",  "name": "Business Projector 5000lm","category": "Display",      "unit": "pcs", "reorder_point": 3,  "reorder_quantity": 8},
            {"sku": "ACC-KB-001",   "name": "Mechanical Keyboard",      "category": "Accessories",  "unit": "pcs", "reorder_point": 30, "reorder_quantity": 100},
            {"sku": "ACC-MS-001",   "name": "Ergonomic Mouse",          "category": "Accessories",  "unit": "pcs", "reorder_point": 30, "reorder_quantity": 100},
            {"sku": "ACC-HS-001",   "name": "Noise-Cancel Headset",     "category": "Accessories",  "unit": "pcs", "reorder_point": 20, "reorder_quantity": 60},
            {"sku": "PRN-LSR-001",  "name": "Color Laser Printer",      "category": "Printing",     "unit": "pcs", "reorder_point": 5,  "reorder_quantity": 15},
            {"sku": "PRN-TNR-001",  "name": "Toner Cartridge Black",    "category": "Printing",     "unit": "pcs", "reorder_point": 15, "reorder_quantity": 50},
            {"sku": "OFF-DSK-001",  "name": "Standing Desk Frame",      "category": "Furniture",    "unit": "pcs", "reorder_point": 5,  "reorder_quantity": 20},
            {"sku": "OFF-CHR-001",  "name": "Ergonomic Office Chair",   "category": "Furniture",    "unit": "pcs", "reorder_point": 8,  "reorder_quantity": 25},
            {"sku": "CLN-WPE-001",  "name": "Electronic Wipes 100pk",   "category": "Cleaning",     "unit": "pack","reorder_point": 20, "reorder_quantity": 80},
            {"sku": "CLN-AIR-001",  "name": "Compressed Air Can",       "category": "Cleaning",     "unit": "can", "reorder_point": 25, "reorder_quantity": 100},
            {"sku": "SFT-LIC-001",  "name": "Windows 11 Pro License",   "category": "Software",     "unit": "license","reorder_point": 10,"reorder_quantity": 50},
        ]

        products = []
        for p in products_data:
            product = Product(**p)
            db.add(product)
            products.append(product)
        db.flush()
        print(f"  ✅ Created {len(products)} products across 10 categories")

        # ═══════════════════════════════════════════════════════════════
        # 4. INVENTORY — mix of healthy, low, and critical stock
        # ═══════════════════════════════════════════════════════════════
        for product in products:
            min_s = product.reorder_point
            max_s = product.reorder_quantity * 3
            r = random.random()
            if r < 0.15:    # 15% critical (0 stock)
                current = 0
            elif r < 0.35:  # 20% low stock
                current = random.randint(1, min_s)
            else:           # 65% healthy
                current = random.randint(min_s + 1, max_s)

            db.add(Inventory(product_id=product.id, current_stock=current, min_stock=min_s, max_stock=max_s))
        db.flush()
        print(f"  ✅ Created {len(products)} inventory records (15% critical, 20% low, 65% healthy)")

        # ═══════════════════════════════════════════════════════════════
        # 5. SUPPLIER PRICES — 2-4 suppliers per product for comparison
        # ═══════════════════════════════════════════════════════════════
        price_ranges = {
            "Computing":   (80, 650),  "Networking":  (50, 400),
            "Power":       (60, 350),  "Security":    (100, 500),
            "Servers":     (200, 1200),"Storage":     (80, 800),
            "Display":     (150, 900), "Accessories": (15, 120),
            "Printing":    (20, 500),  "Furniture":   (100, 800),
            "Cleaning":    (5, 25),    "Software":    (80, 200),
        }
        sp_count = 0
        for product in products:
            low, high = price_ranges.get(product.category, (50, 500))
            num_suppliers = random.randint(2, 4)
            chosen = random.sample(suppliers, num_suppliers)
            for sup in chosen:
                base_price = round(random.uniform(low, high), 2)
                db.add(SupplierPrice(
                    supplier_id=sup.id,
                    product_id=product.id,
                    unit_price=base_price,
                    currency="USD",
                    min_order_qty=random.choice([1, 5, 10, 25, 50]),
                    lead_time_days=random.randint(3, 30),
                    valid_from=date.today() - timedelta(days=random.randint(30, 180)),
                    valid_to=date.today() + timedelta(days=random.randint(60, 365)),
                    is_active=True,
                    source=random.choice(["manual", "manual", "upload"]),
                ))
                sp_count += 1
        db.flush()
        print(f"  ✅ Created {sp_count} supplier price records (2-4 per product)")

        # ═══════════════════════════════════════════════════════════════
        # 6. PURCHASE ORDERS — 50 POs spread over 6 months
        # ═══════════════════════════════════════════════════════════════
        po_statuses = [
            POStatus.draft, POStatus.draft,
            POStatus.pending_approval, POStatus.pending_approval, POStatus.pending_approval,
            POStatus.approved, POStatus.approved,
            POStatus.sent, POStatus.sent,
            POStatus.received, POStatus.received, POStatus.received,
        ]
        po_notes = [
            "Urgent — production line waiting", "Quarterly restock",
            "Replacement parts request", "New project allocation",
            "Emergency order — client deadline", "R&D department request",
            "Office renovation", "IT infrastructure upgrade",
            "Seasonal stock-up", None, None,
        ]
        user_ids = ["seed_admin", "seed_manager", "seed_officer"]

        all_pos = []
        for i in range(50):
            supplier = random.choice(suppliers[:9])  # active suppliers only
            status = random.choice(po_statuses)
            days_ago = random.randint(1, 180)
            created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))

            po_products = random.sample(products, k=random.randint(1, 6))
            line_items = []
            total = 0.0
            for p in po_products:
                low, high = price_ranges.get(p.category, (50, 500))
                qty = random.randint(5, 150)
                price = round(random.uniform(low, high), 2)
                tp = round(qty * price, 2)
                total += tp
                line_items.append(POLineItem(product_id=p.id, quantity=qty, unit_price=price, total_price=tp))

            po = PurchaseOrder(
                po_number=f"PO-2026-{str(i + 1).zfill(4)}",
                supplier_id=supplier.id,
                created_by=random.choice(user_ids),
                status=status,
                total_amount=round(total, 2),
                expected_delivery=date.today() + timedelta(days=random.randint(-30, 60)),
                notes=random.choice(po_notes),
                line_items=line_items,
            )
            po.created_at = created_at
            db.add(po)
            all_pos.append(po)

        db.flush()
        print(f"  ✅ Created {len(all_pos)} purchase orders with line items (6-month span)")

        # ═══════════════════════════════════════════════════════════════
        # 7. APPROVALS — records for approved/sent/received POs
        # ═══════════════════════════════════════════════════════════════
        approval_comments = ["Approved", "LGTM", "Within budget", "Proceed", "Good pricing", "Approved — urgent"]
        approval_count = 0
        for po in all_pos:
            if po.status in [POStatus.approved, POStatus.sent, POStatus.received]:
                approval = Approval(
                    po_id=po.id,
                    approver_id=random.choice(["seed_admin", "seed_manager", "seed_finance"]),
                    status=ApprovalStatus.approved,
                    comments=random.choice(approval_comments),
                    approval_level=1 if po.total_amount < 25000 else 2,
                    decided_at=po.created_at + timedelta(hours=random.randint(1, 48)),
                )
                db.add(approval)
                approval_count += 1
            elif po.status == POStatus.pending_approval:
                # 30% of pending POs have a past rejection
                if random.random() < 0.3:
                    approval = Approval(
                        po_id=po.id,
                        approver_id="seed_finance",
                        status=ApprovalStatus.rejected,
                        comments=random.choice(["Over budget", "Need alternative quote", "Requires VP approval"]),
                        approval_level=1,
                        decided_at=po.created_at + timedelta(hours=random.randint(1, 72)),
                    )
                    db.add(approval)
                    approval_count += 1
        db.flush()
        print(f"  ✅ Created {approval_count} approval records")

        # ═══════════════════════════════════════════════════════════════
        # 8. BUDGETS — monthly budgets per category for 6 months
        # ═══════════════════════════════════════════════════════════════
        categories = list(set(p.category for p in products))
        budget_count = 0
        for cat in categories:
            allocated = round(random.uniform(8000, 60000), 2)
            for month_offset in range(6):
                dt = datetime.utcnow() - timedelta(days=30 * month_offset)
                spent = round(allocated * random.uniform(0.3, 1.3), 2)  # some over budget
                db.add(Budget(
                    category=cat,
                    budget_type="category",
                    period_year=dt.year,
                    period_month=dt.month,
                    allocated_amount=allocated,
                    spent_amount=spent,
                    currency="USD",
                ))
                budget_count += 1
        db.flush()
        print(f"  ✅ Created {budget_count} budget records ({len(categories)} categories × 6 months)")

        # ═══════════════════════════════════════════════════════════════
        # 9. NOTIFICATIONS — realistic recent notifications
        # ═══════════════════════════════════════════════════════════════
        notif_templates = [
            ("stock_alert",     "Low Stock Alert",               "{{product}} is running low ({{qty}} remaining). Consider reordering.", "/inventory"),
            ("stock_alert",     "Critical: Out of Stock",        "{{product}} has 0 units in stock. Immediate action required.", "/inventory"),
            ("approval_needed", "PO Needs Your Approval",        "Purchase order {{po}} (${{amount}}) is awaiting your approval.", "/approvals"),
            ("approval_result", "PO Approved",                   "Your purchase order {{po}} has been approved by {{approver}}.", "/purchase-orders"),
            ("approval_result", "PO Rejected",                   "Purchase order {{po}} was rejected: '{{reason}}'.", "/purchase-orders"),
            ("price_spike",     "Price Alert",                   "{{product}} price from {{supplier}} increased by {{pct}}%.", "/suppliers"),
            ("po_received",     "Order Received",                "Purchase order {{po}} from {{supplier}} has been received.", "/purchase-orders"),
            ("forecast_ready",  "New AI Forecast Available",     "Monthly demand forecast for {{category}} is ready to review.", "/ai-insights"),
            ("system",          "Budget Warning",                "{{category}} spending is at {{pct}}% of monthly budget.", "/analytics"),
            ("system",          "New Supplier Added",            "{{supplier}} has been added as a new supplier.", "/suppliers"),
        ]

        notif_count = 0
        target_users = ["seed_admin", "seed_manager", "seed_officer", "seed_finance"]
        sample_products = [p.name for p in products[:10]]
        sample_pos = [po.po_number for po in all_pos[:15]]

        for i in range(40):
            tmpl = random.choice(notif_templates)
            hours_ago = random.randint(1, 720)  # up to 30 days ago
            msg = tmpl[2].replace("{{product}}", random.choice(sample_products)) \
                         .replace("{{po}}", random.choice(sample_pos)) \
                         .replace("{{amount}}", f"{random.randint(1000, 80000):,}") \
                         .replace("{{approver}}", random.choice(["Sarah Chen", "Lisa Park", "Admin"])) \
                         .replace("{{reason}}", random.choice(["Over budget", "Need alternative quote"])) \
                         .replace("{{supplier}}", random.choice([s.name for s in suppliers[:5]])) \
                         .replace("{{pct}}", str(random.randint(8, 45))) \
                         .replace("{{category}}", random.choice(categories)) \
                         .replace("{{qty}}", str(random.randint(0, 5)))

            db.add(Notification(
                user_id=random.choice(target_users),
                type=tmpl[0],
                title=tmpl[1],
                message=msg,
                link=tmpl[3],
                is_read=random.random() < 0.5,
            ))
            notif_count += 1

        db.flush()
        print(f"  ✅ Created {notif_count} notifications")

        # ═══════════════════════════════════════════════════════════════
        # 10. AUDIT LOGS — recent actions for compliance
        # ═══════════════════════════════════════════════════════════════
        audit_actions = [
            ("created", "product",        "Added new product"),
            ("updated", "product",        "Updated product details"),
            ("created", "purchase_order", "Created new purchase order"),
            ("approved", "purchase_order","Approved purchase order"),
            ("rejected", "purchase_order","Rejected purchase order"),
            ("updated", "supplier",       "Updated supplier information"),
            ("created", "supplier",       "Added new supplier"),
            ("updated", "inventory",      "Stock adjustment"),
            ("updated", "budget",         "Budget allocation updated"),
        ]

        audit_count = 0
        for i in range(60):
            action, entity_type, _ = random.choice(audit_actions)
            entity_id = str(uuid.uuid4())
            user_idx = random.randint(0, len(users) - 1)
            hours_ago = random.randint(1, 2160)  # up to 90 days

            db.add(AuditLog(
                user_id=users[user_idx].clerk_id,
                user_email=users[user_idx].email,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                old_values={"status": "draft"} if "updated" in action else None,
                new_values={"status": "approved"} if action == "approved" else {"status": "active"},
                ip_address=f"192.168.1.{random.randint(10, 200)}",
            ))
            audit_count += 1
        db.flush()
        print(f"  ✅ Created {audit_count} audit log entries")

        # ═══════════════════════════════════════════════════════════════
        # 11. DEMAND FORECASTS — predictions for next 3 months
        # ═══════════════════════════════════════════════════════════════
        forecast_count = 0
        for product in products:
            base_demand = random.uniform(20, 200)
            for month_offset in range(1, 4):
                forecast_date = date.today() + timedelta(days=30 * month_offset)
                predicted = round(base_demand * (1 + random.uniform(-0.15, 0.25)), 1)
                db.add(DemandForecast(
                    product_id=product.id,
                    forecast_date=forecast_date,
                    predicted_demand=predicted,
                    confidence_lower=round(predicted * 0.75, 1),
                    confidence_upper=round(predicted * 1.30, 1),
                    confidence_score=round(random.uniform(0.65, 0.95), 2),
                    model_version="v1-seed",
                ))
                forecast_count += 1
        db.flush()
        print(f"  ✅ Created {forecast_count} demand forecast records (3 months × {len(products)} products)")

        # ═══════════════════════════════════════════════════════════════
        db.commit()

        print(f"\n🎉 Seed complete! Database populated with:")
        print(f"   • {len(users)} Users (admin, manager, officer, finance, viewer)")
        print(f"   • {len(suppliers)} Suppliers")
        print(f"   • {len(products)} Products across {len(categories)} categories")
        print(f"   • {len(products)} Inventory records")
        print(f"   • {sp_count} Supplier Price records")
        print(f"   • {len(all_pos)} Purchase Orders with line items")
        print(f"   • {approval_count} Approval records")
        print(f"   • {budget_count} Budget records")
        print(f"   • {notif_count} Notifications")
        print(f"   • {audit_count} Audit Log entries")
        print(f"   • {forecast_count} Demand Forecasts")
        print(f"\n📊 AI Insights engine will now generate real alerts from this data!")
        print(f"   Visit /ai-insights to see reorder alerts, spend anomalies, and supplier risk.")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Seed failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
