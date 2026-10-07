import { createDatabase } from "./client.js";
import { loadConfig } from "../config.js";
import { hashPassword } from "../lib/password.js";
import type { Pool } from "pg";
import { pathToFileURL } from "node:url";

const demoDate = "2026-11-28";
const names = ["Ahmed Khan", "Usama", "Ali Hassan", "Supplier Corp", "Fatima Ahmed", "Tech Parts", "Bilal Trading", "Raw Materials Co", "Hassan & Sons", "Karachi Supplies"];
const totals = [42000, 18500, 50000, 75000, 30000, 12000, 45000, 90000, 35000, 22000];
const invoiceIds = ["INV-001", "INV-005", "INV-002", "INV-007", "INV-019", "INV-009", "INV-012", "INV-010", "INV-006", "INV-008"];
const paymentMethods = ["Cash", "Bank Transfer", "Easypaisa", "JazzCash", "Cheque"];

export async function seedDevelopment(pool: Pool) {
const client = await pool.connect();
try {
  await client.query("begin");

  await client.query(`
    delete from payment_allocations
    where payment_id in (
      select id from payments where business_id = 'business-1'
    )
    or invoice_id in (
      select id from invoices where business_id = 'business-1'
    )
  `);

  await client.query("delete from invoices where business_id = 'business-1'");
  await client.query("delete from payments where business_id = 'business-1'");
  await client.query("delete from transactions where business_id = 'business-1'");
  await client.query("delete from businesses where id = 'business-1'");
  await client.query("delete from users where id='user-1'");
  await client.query(
    "insert into users (id,email,name,password_hash) values ('user-1',$1,'Haris Munir',$2)",
    ["owner@alienterprise.pk", await hashPassword("finbot-demo")],
  );
  await client.query(
    `insert into businesses (id,name,currency,timezone,city,phone,email,address,ntn,opening_cash_minor)
     values ('business-1','Ali Enterprise','PKR','Asia/Karachi','Karachi','03001234567','accounts@alienterprise.pk','Office 5, Block C, Karachi','NTN-123456',0)`,
  );
  await client.query("insert into workspace_memberships (user_id,business_id,role,status,permissions,last_active_at) values ('user-1','business-1','Owner','Active',$1,now())", [JSON.stringify(["all"])]);
  await client.query("insert into business_settings (business_id,payment_methods) values ('business-1',$1)", [JSON.stringify(paymentMethods)]);

  for (const [index, name] of names.entries()) {
    const kind = [1, 3, 5, 7].includes(index) ? "Supplier" : "Customer";
    await client.query(
      `insert into parties (id,business_id,name,kind,phone,email,ntn,address,payment_terms)
       values ($1,'business-1',$2,$3,$4,$5,$6,'Office 5, Block C, Karachi','Net 30')`,
      [`party-${index + 1}`, name, kind, `0300${String(index + 1000000)}`, `${name.toLowerCase().replace(/[^a-z]/g, "")}@example.com`, `NTN-${123456 + index}`],
    );
  }

  const transactionRows: { id: string; partyId: string; type: "Sale" | "Purchase"; date: string; total: number; paid: number }[] = [];
  for (let i = 0; i < 50; i++) {
    const n = i % 10;
    const total = totals[n];
    const partial = [0, 3, 8].includes(n);
    const paid = partial ? (n === 0 ? 25000 : Math.round(total / 2)) : n === 6 ? 0 : total;
    const date = new Date(Date.UTC(2026, 10, 28 - i)).toISOString().slice(0, 10);
    const type = [1, 3, 5, 7].includes(n) ? "Purchase" : "Sale";
    const transactionId = i === 0 ? "SALE-000128" : `${type === "Purchase" ? "PUR" : "SALE"}-${String(127 - i).padStart(6, "0")}`;
    const subtotal = total * 100;
    const discount = i === 0 ? 210000 : 0;
    const tax = i === 0 ? 210000 : 0;
    await client.query(
      `insert into transactions
       (id,display_id,business_id,party_id,created_by,date,due_date,type,status,subtotal_minor,discount_minor,tax_minor,tax_rate_basis_points,total_minor,notes)
       values ($1,$1,'business-1',$2,'user-1',$3,$3,$4,$5,$6,$7,$8,$9,$10,'')`,
      [transactionId, `party-${n + 1}`, date, type, paid === total ? "Completed" : paid > 0 ? "Partial" : "Overdue", subtotal, discount, tax, i === 0 ? 500 : 0, total * 100],
    );
    const lines = i === 0
      ? [{ description: "Rice Bags", quantity: 5000, unit: "Bags", rate: 500000 }, { description: "Cooking Oil", quantity: 2000, unit: "Cartons", rate: 850000 }]
      : [{ description: n % 2 ? "Wholesale supplies" : "Grocery stock", quantity: 1000, unit: "Lot", rate: total * 100 }];
    for (const [position, line] of lines.entries())
      await client.query(
        "insert into transaction_items (id,transaction_id,position,description,quantity_milli,unit,rate_minor) values ($1,$2,$3,$4,$5,$6,$7)",
        [`${transactionId}-line-${position + 1}`, transactionId, position, line.description, line.quantity, line.unit, line.rate],
      );
    transactionRows.push({ id: transactionId, partyId: `party-${n + 1}`, type, date, total, paid });
  }

  for (let i = 0; i < 10; i++) {
    const transaction = transactionRows[i];
    const invoiceId = invoiceIds[i];
    const dueDate = transaction.paid < transaction.total && i !== 0 ? transaction.date : "2026-12-28";
    await client.query("update transactions set due_date=$2 where id=$1", [transaction.id, dueDate]);
    await client.query(
      `insert into invoices
       (id,display_id,business_id,transaction_id,party_id,date,due_date,reference,subtotal_minor,tax_minor,discount_minor,total_minor,status,notes,terms)
       values ($1,$1,'business-1',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'','Payment due within 30 days.')`,
      [invoiceId, transaction.id, transaction.partyId, transaction.date, dueDate, `REF-2026-${i + 1}`, transaction.total * 100, i === 0 ? 210000 : 0, i === 0 ? 210000 : 0, transaction.total * 100, transaction.paid === transaction.total ? "Paid" : transaction.paid > 0 ? "Partial" : "Overdue"],
    );
    const items = await client.query("select * from transaction_items where transaction_id=$1 order by position", [transaction.id]);
    for (const item of items.rows)
      await client.query(
        `insert into invoice_items (id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points)
         values ($1,$2,$3,$4,$4,$5,$6,$7,$8)`,
        [`${invoiceId}-line-${item.position + 1}`, invoiceId, item.position, item.description, item.quantity_milli, item.unit, item.rate_minor, i === 0 ? 500 : 0],
      );
  }
  for (let i = 0; i < 2; i++) {
    const invoiceId = `INV-DRAFT-${i + 1}`;
    await client.query(
      `insert into invoices (id,display_id,business_id,party_id,date,due_date,reference,subtotal_minor,tax_minor,discount_minor,total_minor,status,notes,terms)
       values ($1,$1,'business-1',$2,$3,'2026-12-28','',3000000,0,0,3000000,'Draft','','')`,
      [invoiceId, `party-${i === 0 ? 5 : 3}`, demoDate],
    );
    await client.query(
      `insert into invoice_items (id,invoice_id,position,item,description,quantity_milli,unit,rate_minor,tax_basis_points)
       values ($1,$2,0,'Grocery stock','Wholesale goods',1000,'Lot',3000000,0)`,
      [`${invoiceId}-line-1`, invoiceId],
    );
  }

  let settledNet = 0;
  let paymentIndex = 0;
  for (const transaction of transactionRows.filter((row) => row.paid > 0)) {
    const paymentId = paymentIndex === 0 ? "PAY-0012" : `PAY-${String(100 + paymentIndex).padStart(4, "0")}`;
    const direction = transaction.type === "Sale" ? "Received" : "Sent";
    const invoiceId = transactionRows.indexOf(transaction) < 10 ? invoiceIds[transactionRows.indexOf(transaction)] : null;
    await client.query(
      `insert into payments (id,display_id,business_id,party_id,transaction_id,direction,amount_minor,method,date,reference,notes,status)
       values ($1,$1,'business-1',$2,$3,$4,$5,$6,$7,$8,'Opening seed payment','Completed')`,
      [paymentId, transaction.partyId, transaction.id, direction, transaction.paid * 100, paymentMethods[paymentIndex % paymentMethods.length], transaction.date, `REF-${100 + paymentIndex}`],
    );
    if (invoiceId) await client.query("insert into payment_allocations (payment_id,invoice_id,amount_minor) values ($1,$2,$3)", [paymentId, invoiceId, transaction.paid * 100]);
    settledNet += transaction.paid * 100 * (direction === "Received" ? 1 : -1);
    paymentIndex++;
  }
  await client.query(
    `insert into payments (id,display_id,business_id,party_id,direction,amount_minor,method,date,reference,notes,status)
     values ('PAY-0200','PAY-0200','business-1','party-7','Received',1200000,'Cheque',$1,'CHQ-1001','Awaiting clearance','Pending'),
            ('PAY-0201','PAY-0201','business-1','party-5','Received',1500000,'Easypaisa',$1,'EP-1002','Demo failed payment','Failed')`,
    [demoDate],
  );
  await client.query("update businesses set opening_cash_minor=$2 where id=$1", ["business-1", 50_000_000 - settledNet]);
  const notices = [
    ["notice-1", "Invoice overdue", "Bilal Trading has an overdue invoice.", false, "/invoices/INV-012", demoDate],
    ["notice-2", "Payment recorded", "PKR 25,000 received from Ahmed Khan.", false, "/transactions/SALE-000128", demoDate],
    ["notice-3", "New invoice created", "Invoice INV-019 was created for Fatima Ahmed.", false, "/invoices/INV-019", demoDate],
    ["notice-4", "Payment pending", "Cheque CHQ-1001 is awaiting clearance.", true, "/payments", "2026-11-27"],
    ["notice-5", "Invoice paid", "Ali Hassan completed payment for invoice INV-002.", true, "/invoices/INV-002", "2026-11-27"],
    ["notice-6", "Transaction completed", "A sale to Fatima Ahmed was marked completed.", true, "/transactions/SALE-000124", "2026-11-25"],
    ["notice-7", "Invoice overdue", "Ahmed Khan has an outstanding balance of PKR 17,000.", true, "/transactions/SALE-000128", "2026-11-24"],
  ];
  for (const notice of notices)
    await client.query("insert into notifications (id,business_id,title,description,read,href,event_date) values ($1,'business-1',$2,$3,$4,$5,$6)", notice);
  await client.query("commit");
  console.info(JSON.stringify({ level: "info", event: "database_seeded", login: "owner@alienterprise.pk" }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = createDatabase(loadConfig());
  try {
    await seedDevelopment(pool);
  } finally {
    await pool.end();
  }
}
