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
      overnightRateCents: 4600,
      overnightInOutPrivileges: true,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 500,
      pricingTiers: [
        { maxHours: 3, rateCents: 2000, inOutPrivileges: false },
        { maxHours: null, rateCents: 4600, inOutPrivileges: true },
      ],
    },
    create: {
      tenantId: tenant.id,
      name: "Hampton Inn",
      identifier: "hampton",
      overnightRateCents: 4600,
      overnightInOutPrivileges: true,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 500,
      pricingTiers: [
        { maxHours: 3, rateCents: 2000, inOutPrivileges: false },
        { maxHours: null, rateCents: 4600, inOutPrivileges: true },
      ],
    },
  });

  await prisma.user.update({
    where: { id: staff.id },
    data: { locationId: hampton.id },
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
      overnightRateCents: 5500,
      overnightInOutPrivileges: true,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 600,
      pricingTiers: [
        { maxHours: 2, rateCents: 2200, inOutPrivileges: false },
        { maxHours: 5, rateCents: 3300, inOutPrivileges: false },
        { maxHours: null, rateCents: 5500, inOutPrivileges: true },
      ],
    },
    create: {
      tenantId: tenant.id,
      name: "Hyatt Regency",
      identifier: "hyatt",
      overnightRateCents: 5500,
      overnightInOutPrivileges: true,
      taxRateBasisPoints: 2325,
      hotelSharePoints: 600,
      pricingTiers: [
        { maxHours: 2, rateCents: 2200, inOutPrivileges: false },
        { maxHours: 5, rateCents: 3300, inOutPrivileges: false },
        { maxHours: null, rateCents: 5500, inOutPrivileges: true },
      ],
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

  const existingHamptonTicket = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1001",
    },
  });

  const hamptonTicket = existingHamptonTicket
    ? await prisma.ticket.update({
        where: { id: existingHamptonTicket.id },
        data: {
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
      })
    : await prisma.ticket.create({
      data: {
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

  const existingHyattTicket = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hyatt.id,
      ticketNumber: "HYATT-2001",
    },
  });

  const hyattTicket = existingHyattTicket
    ? await prisma.ticket.update({
        where: { id: existingHyattTicket.id },
        data: {
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
      })
    : await prisma.ticket.create({
      data: {
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
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hampton_123",
      stripeProduct: "hampton-3-hours",
      metadata: {
        note: "Prepaid 3-hour stay",
      },
    },
    create: {
      id: "seed-payment-hampton",
      ticketId: hamptonTicket.id,
      tenantId: tenant.id,
      amountCents: 2000,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hampton_123",
      stripeProduct: "hampton-3-hours",
      metadata: {
        note: "Prepaid 3-hour stay",
      },
    },
  });

  // Additional Hampton tickets for scenario coverage
  const existingTicket2 = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1002",
    },
  });

  if (!existingTicket2) {
    await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        locationId: hampton.id,
        ticketNumber: "HAMP-1002",
        customerName: "Alex Morgan",
        customerPhone: "+13125550300",
        vehicleMake: "Audi",
        vehicleModel: "Q5",
        vehicleColor: "Silver",
        licensePlate: "IL-VAL201",
        parkingLocation: "Deck A - Spot 14",
        rateType: RateType.HOURLY,
        inOutPrivileges: false,
        status: TicketStatus.CHECKED_IN,
        vehicleStatus: VehicleStatus.WITH_US,
        checkInTime: new Date(now.getTime() - 1000 * 60 * 45), // 45 minutes ago
        notes: "Prefers phone call on pickup.",
      },
    });
  }

  const existingTicket3 = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1003",
    },
  });

  if (!existingTicket3) {
    await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        locationId: hampton.id,
        ticketNumber: "HAMP-1003",
        customerName: "Morgan Lee",
        customerPhone: "+13125550400",
        vehicleMake: "Toyota",
        vehicleModel: "Camry",
        vehicleColor: "White",
        licensePlate: "IL-VAL202",
        parkingLocation: "Deck B - Spot 4",
        rateType: RateType.HOURLY,
        inOutPrivileges: false,
        status: TicketStatus.CHECKED_IN,
        vehicleStatus: VehicleStatus.WITH_US,
        checkInTime: new Date(now.getTime() - 1000 * 60 * 90), // 1.5 hours ago
        notes: "Has luggage in trunk.",
      },
    });
  }

  const existingTicket4 = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1004",
    },
  });

  const hamptonTicket4 = existingTicket4
    ? existingTicket4
    : await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        locationId: hampton.id,
        ticketNumber: "HAMP-1004",
        customerName: "Jamie Chen",
        customerPhone: "+13125550500",
        vehicleMake: "Honda",
        vehicleModel: "Civic",
        vehicleColor: "Black",
        licensePlate: "IL-VAL203",
        parkingLocation: "Deck A - Spot 5",
        rateType: RateType.HOURLY,
        inOutPrivileges: true,
        status: TicketStatus.READY_FOR_PICKUP,
        vehicleStatus: VehicleStatus.AWAY,
        checkInTime: new Date(now.getTime() - 1000 * 60 * 60 * 5), // 5 hours ago
        notes: "Guest at conference center.",
      },
    });

  const existingTicket5 = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1005",
    },
  });

  const hamptonTicket5 = existingTicket5
    ? existingTicket5
    : await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        locationId: hampton.id,
        ticketNumber: "HAMP-1005",
        customerName: "Chris Alvarez",
        customerPhone: "+13125550600",
        vehicleMake: "Ford",
        vehicleModel: "Explorer",
        vehicleColor: "Blue",
        licensePlate: "IL-VAL204",
        parkingLocation: "Deck C - Spot 9",
        rateType: RateType.OVERNIGHT,
        inOutPrivileges: true,
        status: TicketStatus.READY_FOR_PICKUP,
        vehicleStatus: VehicleStatus.AWAY,
        checkInTime: new Date(now.getTime() - 1000 * 60 * 60 * 20), // 20 hours ago
        notes: "Returning at 7 PM.",
      },
    });

  const existingTicket6 = await prisma.ticket.findFirst({
    where: {
      tenantId: tenant.id,
      locationId: hampton.id,
      ticketNumber: "HAMP-1006",
    },
  });

  const hamptonTicket6 = existingTicket6
    ? existingTicket6
    : await prisma.ticket.create({
      data: {
        tenantId: tenant.id,
        locationId: hampton.id,
        ticketNumber: "HAMP-1006",
        customerName: "Taylor Grant",
        customerPhone: "+13125550700",
        vehicleMake: "Subaru",
        vehicleModel: "Outback",
        vehicleColor: "Green",
        licensePlate: "IL-VAL205",
        parkingLocation: "Deck B - Spot 10",
        rateType: RateType.OVERNIGHT,
        inOutPrivileges: false,
        status: TicketStatus.CHECKED_IN,
        vehicleStatus: VehicleStatus.WITH_US,
        checkInTime: new Date(now.getTime() - 1000 * 60 * 60 * 8), // 8 hours ago
        notes: "VIP guest, keep near exit.",
      },
    });

  // Payments for new tickets
  await prisma.payment.create({
    data: {
      ticketId: hamptonTicket4.id,
      tenantId: tenant.id,
      amountCents: 3000,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hampton_1004",
      stripeProduct: "hampton-hourly",
    },
  });

  await prisma.payment.create({
    data: {
      ticketId: hamptonTicket5.id,
      tenantId: tenant.id,
      amountCents: 5500,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hampton_overnight_1005",
      stripeProduct: "hampton-overnight",
    },
  });

  await prisma.payment.create({
    data: {
      ticketId: hamptonTicket6.id,
      tenantId: tenant.id,
      amountCents: 4800,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hampton_paid_1006",
      stripeProduct: "hampton-overnight",
    },
  });

  await prisma.payment.upsert({
    where: { id: "seed-payment-hyatt" },
    update: {
      amountCents: 5500,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hyatt_overnight",
      stripeProduct: "hyatt-overnight",
      metadata: {
        note: "Overnight stay settled at check-in",
      },
    },
    create: {
      id: "seed-payment-hyatt",
      ticketId: hyattTicket.id,
      tenantId: tenant.id,
      amountCents: 5500,
      status: PaymentStatus.COMPLETED,
      stripeLinkId: "plink_hyatt_overnight",
      stripeProduct: "hyatt-overnight",
      metadata: {
        note: "Overnight stay settled at check-in",
      },
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

