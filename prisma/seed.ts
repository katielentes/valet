import "dotenv/config";
import { hashSync } from "bcryptjs";
import {
  AuditAction,
  MessageDirection,
  MessageStatus,
  PaymentStatus,
  PrismaClient,
  RateType,
  ReportPeriod,
  TicketStatus,
  UserRole,
  VehicleStatus,
} from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "valetpro-demo" },
    update: { name: "ValetPro Demo" },
    create: {
      name: "ValetPro Demo",
      slug: "valetpro-demo",
    },
  });

  const passwordHash = hashSync("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@valetpro.test" },
    update: {
      name: "Avery Admin",
      tenantId: tenant.id,
      hashedPassword: passwordHash,
      role: UserRole.ADMIN,
    },
    create: {
      tenantId: tenant.id,
      email: "admin@valetpro.test",
      name: "Avery Admin",
      hashedPassword: passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@valetpro.test" },
    update: {
      name: "Morgan Manager",
      tenantId: tenant.id,
      hashedPassword: passwordHash,
      role: UserRole.MANAGER,
    },
    create: {
      tenantId: tenant.id,
      email: "manager@valetpro.test",
      name: "Morgan Manager",
      hashedPassword: passwordHash,
      role: UserRole.MANAGER,
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: "valet@valetpro.test" },
    update: {
      name: "Sam Staff",
      tenantId: tenant.id,
      hashedPassword: passwordHash,
      role: UserRole.STAFF,
    },
    create: {
      tenantId: tenant.id,
      email: "valet@valetpro.test",
      name: "Sam Staff",
      hashedPassword: passwordHash,
      role: UserRole.STAFF,
    },
  });

  const hampton = await prisma.location.upsert({
    where: {
      tenantId_identifier: {
        tenantId: tenant.id,
        identifier: "hampton",
      },
    },
    update: {
      name: "Hampton Inn",
      hourlyRateCents: 2000,
      hourlyTierHours: 3,
      overnightRateCents: 4600,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 500,
    },
    create: {
      tenantId: tenant.id,
      name: "Hampton Inn",
      identifier: "hampton",
      hourlyRateCents: 2000,
      hourlyTierHours: 3,
      overnightRateCents: 4600,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 500,
    },
  });

  const hyatt = await prisma.location.upsert({
    where: {
      tenantId_identifier: {
        tenantId: tenant.id,
        identifier: "hyatt",
      },
    },
    update: {
      name: "Hyatt Regency",
      hourlyRateCents: 2200,
      hourlyTierHours: 5,
      overnightRateCents: 5500,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 600,
    },
    create: {
      tenantId: tenant.id,
      name: "Hyatt Regency",
      identifier: "hyatt",
      hourlyRateCents: 2200,
      hourlyTierHours: 5,
      overnightRateCents: 5500,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 600,
    },
  });

  const readyTemplate = await prisma.messageTemplate.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Car Ready",
      },
    },
    update: {
      body:
        "Hi {{customerName}}, your vehicle is ready for pickup at {{locationName}}. Reply READY when you are heading over.",
    },
    create: {
      tenantId: tenant.id,
      name: "Car Ready",
      body:
        "Hi {{customerName}}, your vehicle is ready for pickup at {{locationName}}. Reply READY when you are heading over.",
    },
  });

  const delayTemplate = await prisma.messageTemplate.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Delay Update",
      },
    },
    update: {
      body:
        "Thanks for your patience, {{customerName}}. Your car will be ready in approximately {{eta}} minutes.",
    },
    create: {
      tenantId: tenant.id,
      name: "Delay Update",
      body:
        "Thanks for your patience, {{customerName}}. Your car will be ready in approximately {{eta}} minutes.",
    },
  });

  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 1000 * 60 * 60 * 2);
  const sixteenHoursAgo = new Date(now.getTime() - 1000 * 60 * 60 * 16);

  const hamptonTicket = await prisma.ticket.upsert({
    where: {
      tenantId_ticketNumber: {
        tenantId: tenant.id,
        ticketNumber: "HAMP-1001",
      },
    },
    update: {
      customerName: "Jordan Price",
      customerPhone: "+13125550100",
      vehicleMake: "Tesla",
      vehicleModel: "Model 3",
      vehicleColor: "Blue",
      licensePlate: "IL-VAL100",
      parkingLocation: "Deck A - Spot 12",
      rateType: RateType.HOURLY,
      inOutPrivileges: true,
      status: TicketStatus.READY_FOR_PICKUP,
      vehicleStatus: VehicleStatus.WITH_US,
      checkInTime: twoHoursAgo,
      assignedUserId: manager.id,
      notes: "Customer requested text when car is ready.",
    },
    create: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1001",
      customerName: "Jordan Price",
      customerPhone: "+13125550100",
      vehicleMake: "Tesla",
      vehicleModel: "Model 3",
      vehicleColor: "Blue",
      licensePlate: "IL-VAL100",
      parkingLocation: "Deck A - Spot 12",
      rateType: RateType.HOURLY,
      inOutPrivileges: true,
      status: TicketStatus.READY_FOR_PICKUP,
      vehicleStatus: VehicleStatus.WITH_US,
      checkInTime: twoHoursAgo,
      assignedUserId: manager.id,
      notes: "Customer requested text when car is ready.",
    },
  });

  const hyattTicket = await prisma.ticket.upsert({
    where: {
      tenantId_ticketNumber: {
        tenantId: tenant.id,
        ticketNumber: "HYATT-2001",
      },
    },
    update: {
      customerName: "Taylor Rivers",
      customerPhone: "+13125550200",
      vehicleMake: "BMW",
      vehicleModel: "X5",
      vehicleColor: "Black",
      licensePlate: "IL-VAL200",
      parkingLocation: "Tower B - Spot 8",
      rateType: RateType.OVERNIGHT,
      inOutPrivileges: false,
      status: TicketStatus.CHECKED_IN,
      vehicleStatus: VehicleStatus.WITH_US,
      checkInTime: sixteenHoursAgo,
      assignedUserId: staff.id,
      notes: "Guest requested car at 9 AM.",
    },
    create: {
      tenantId: tenant.id,
      locationId: hyatt.id,
      ticketNumber: "HYATT-2001",
      customerName: "Taylor Rivers",
      customerPhone: "+13125550200",
      vehicleMake: "BMW",
      vehicleModel: "X5",
      vehicleColor: "Black",
      licensePlate: "IL-VAL200",
      parkingLocation: "Tower B - Spot 8",
      rateType: RateType.OVERNIGHT,
      inOutPrivileges: false,
      status: TicketStatus.CHECKED_IN,
      vehicleStatus: VehicleStatus.WITH_US,
      checkInTime: sixteenHoursAgo,
      assignedUserId: staff.id,
      notes: "Guest requested car at 9 AM.",
    },
  });

  await prisma.message.upsert({
    where: { id: "seed-message-hampton-ready" },
    update: {
      body: "Jordan, your Model 3 is staged at the front drive. Reply READY when you’re on your way.",
      sentAt: new Date(),
      deliveryStatus: MessageStatus.SENT,
    },
    create: {
      id: "seed-message-hampton-ready",
      ticketId: hamptonTicket.id,
      tenantId: tenant.id,
      direction: MessageDirection.OUTBOUND,
      body: "Jordan, your Model 3 is staged at the front drive. Reply READY when you’re on your way.",
      templateId: readyTemplate.id,
      sentAt: new Date(),
      deliveryStatus: MessageStatus.SENT,
    },
  });

  await prisma.message.upsert({
    where: { id: "seed-message-hyatt-delay" },
    update: {
      body: "Taylor, we’re just finishing the wash. Expect your BMW in about 10 minutes.",
      sentAt: new Date(),
    },
    create: {
      id: "seed-message-hyatt-delay",
      ticketId: hyattTicket.id,
      tenantId: tenant.id,
      direction: MessageDirection.OUTBOUND,
      body: "Taylor, we’re just finishing the wash. Expect your BMW in about 10 minutes.",
      templateId: delayTemplate.id,
      sentAt: new Date(),
      deliveryStatus: MessageStatus.SENT,
    },
  });

  await prisma.payment.upsert({
    where: { id: "seed-payment-hampton" },
    update: {
      amountCents: 2000,
      status: PaymentStatus.PENDING,
      stripeLinkId: "plink_hampton_123",
      stripeProduct: "hampton-3-hours",
    },
    create: {
      id: "seed-payment-hampton",
      ticketId: hamptonTicket.id,
      tenantId: tenant.id,
      amountCents: 2000,
      status: PaymentStatus.PENDING,
      stripeLinkId: "plink_hampton_123",
      stripeProduct: "hampton-3-hours",
    },
  });

  await prisma.report.upsert({
    where: { id: "seed-report-weekly" },
    update: {
      data: {
        revenue: {
          completed: 46000,
          projected: 7500,
        },
        tickets: {
          total: 18,
          hourly: 12,
          overnight: 6,
        },
      },
    },
    create: {
      id: "seed-report-weekly",
      tenantId: tenant.id,
      locationId: null,
      periodType: ReportPeriod.WEEKLY,
      periodStart: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7),
      periodEnd: now,
      data: {
        revenue: {
          completed: 46000,
          projected: 7500,
        },
        tickets: {
          total: 18,
          hourly: 12,
          overnight: 6,
        },
      },
    },
  });

  await prisma.auditLog.upsert({
    where: { id: "seed-audit-ticket-created" },
    update: {
      details: {
        ticketNumber: hamptonTicket.ticketNumber,
        message: "Ticket created via seed",
      },
    },
    create: {
      id: "seed-audit-ticket-created",
      tenantId: tenant.id,
      ticketId: hamptonTicket.id,
      userId: admin.id,
      action: AuditAction.TICKET_CREATED,
      details: {
        ticketNumber: hamptonTicket.ticketNumber,
        message: "Ticket created via seed",
      },
    },
  });

  await prisma.ticketComment.upsert({
    where: { id: "seed-comment-hyatt" },
    update: {
      body: "Guest extended stay by one night.",
    },
    create: {
      id: "seed-comment-hyatt",
      ticketId: hyattTicket.id,
      userId: staff.id,
      body: "Guest extended stay by one night.",
    },
  });

  console.log("✅ Database seeded with demo data.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("❌ Seeding failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

