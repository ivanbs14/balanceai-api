import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import * as request from "supertest";
import * as bcrypt from "bcrypt";
import { UserModule } from "../src/user/module";
import { AuthModule } from "../src/auth/auth.module";
import { PrismaService } from "../src/prisma-services/prisma.service";

const ownId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
describe("User access (real guard and pipe, fake persistence)", () => {
  let app: INestApplication;
  let cookie: string;
  let otherCookie: string;
  let otherRow: Record<string, any>;
  let row: Record<string, any>;
  const project = (value, select) =>
    select
      ? Object.fromEntries(Object.keys(select).map((key) => [key, value[key]]))
      : { ...value };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = "user-tests-only-secret";
    const module = await Test.createTestingModule({
      imports: [UserModule, AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    cookie = `balance_auth=${module.get(JwtService).sign({ userId: ownId, email: "a@test.com", role: "user" })}`;
    otherCookie = `balance_auth=${module.get(JwtService).sign({ userId: otherId, email: "b@test.com", role: "user" })}`;
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    row = {
      id: ownId,
      name: "A",
      document: "123",
      email: "a@test.com",
      role: "user",
      password: await bcrypt.hash("old-password", 10),
      createdAt: new Date(),
    };
    otherRow = {
      ...row,
      id: otherId,
      name: "B",
      document: "456",
      email: "b@test.com",
    };
    prisma.user.findUnique.mockImplementation(async ({ where, select }) => {
      const found = [row, otherRow].find(
        (value) =>
          where.id === value.id ||
          where.email === value.email ||
          where.document === value.document,
      );
      return found ? project(found, select) : null;
    });
    prisma.user.update.mockImplementation(async ({ data, select }) => {
      Object.assign(row, data);
      return project(row, select);
    });
    prisma.user.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: ownId,
    }));
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each([
    ["get", "/user"],
    ["get", `/user/${ownId}`],
    ["put", `/user/${ownId}`],
    ["delete", `/user/${ownId}`],
  ])("blocks anonymous %s %s", async (method, path) => {
    await request(app.getHttpServer())
      [method](path)
      .send({ name: "Changed" })
      .expect(401);
  });
  it.each(["get", "put", "delete"])(
    "blocks another account for %s before database access",
    async (method) => {
      await request(app.getHttpServer())
        [method](`/user/${otherId}`)
        .set("Cookie", cookie)
        .send({ name: "Changed" })
        .expect(403);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.user.delete).not.toHaveBeenCalled();
    },
  );
  it.each(["get", "put", "delete"])(
    "blocks B accessing A for %s and preserves both accounts",
    async (method) => {
      const originalA = { ...row };
      const originalB = { ...otherRow };
      await request(app.getHttpServer())
        [method](`/user/${ownId}`)
        .set("Cookie", otherCookie)
        .send({ name: "Changed" })
        .expect(403);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(row).toEqual(originalA);
      expect(otherRow).toEqual(originalB);
      const own = await request(app.getHttpServer())
        .get(`/user/${otherId}`)
        .set("Cookie", otherCookie)
        .expect(200);
      expect(own.body.name).toBe("B");
      expect(own.body.password).toBeUndefined();
    },
  );
  it("preserves login response and usable HttpOnly session cookie", async () => {
    await request(app.getHttpServer())
      .post("/auth")
      .send({ email: row.email, password: "wrong" })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post("/auth")
      .send({ email: row.email, password: "old-password" })
      .expect(201);
    expect(login.body.user).toEqual({
      id: ownId,
      name: "A",
      email: "a@test.com",
      role: "user",
    });
    const cookies = login.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("HttpOnly");
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookies[0].split(";")[0])
      .expect(200);
  });
  it("blocks global listing and own deletion", async () => {
    await request(app.getHttpServer())
      .get("/user")
      .set("Cookie", cookie)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/user/${ownId}`)
      .set("Cookie", cookie)
      .expect(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
  it("projects profile and cannot elevate role during update", async () => {
    const read = await request(app.getHttpServer())
      .get(`/user/${ownId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(read.body.password).toBeUndefined();
    const result = await request(app.getHttpServer())
      .put(`/user/${ownId}`)
      .set("Cookie", cookie)
      .send({ name: "Updated", role: "admin" })
      .expect(200);
    expect(result.body).toMatchObject({ name: "Updated", role: "user" });
    expect(result.body.password).toBeUndefined();
    expect(row.role).toBe("user");
  });
  it("creates only ordinary accounts with hashed passwords", async () => {
    await request(app.getHttpServer())
      .post("/user")
      .send({
        name: "New",
        email: "new@test.com",
        document: "789",
        password: "new-password",
        role: "admin",
      })
      .expect(201);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe("user");
    expect(await bcrypt.compare("new-password", data.password)).toBe(true);
  });
  it("requires correct current password and never persists it", async () => {
    const update = () =>
      request(app.getHttpServer()).put(`/user/${ownId}`).set("Cookie", cookie);
    await update().send({ password: "new-password" }).expect(400);
    await update()
      .send({ password: "new-password", currentPassword: "wrong" })
      .expect(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
    const result = await update()
      .send({ password: "new-password", currentPassword: "old-password" })
      .expect(200);
    expect(await bcrypt.compare("new-password", row.password)).toBe(true);
    expect(row.currentPassword).toBeUndefined();
    expect(result.body.password).toBeUndefined();
    expect(result.body.currentPassword).toBeUndefined();
  });
  it.each([
    {},
    { name: null },
    { name: 123 },
    { email: "invalid" },
    { password: null },
    { role: "admin" },
    { currentPassword: "old-password" },
  ])("rejects invalid update %j", async (body) => {
    await request(app.getHttpServer())
      .put(`/user/${ownId}`)
      .set("Cookie", cookie)
      .send(body)
      .expect(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs and cookies", async () => {
    await request(app.getHttpServer())
      .get("/user/invalid")
      .set("Cookie", cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/user/${ownId}`)
      .set("Cookie", "balance_auth=%ZZ")
      .expect(401);
  });
  it("returns 409 for unique conflicts", async () => {
    prisma.user.update.mockRejectedValueOnce({ code: "P2002" });
    await request(app.getHttpServer())
      .put(`/user/${ownId}`)
      .set("Cookie", cookie)
      .send({ email: "taken@test.com" })
      .expect(409);
  });
  it("preserves auth/me projection", async () => {
    const result = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(result.body.user).toEqual({
      id: ownId,
      name: "A",
      email: "a@test.com",
      role: "user",
    });
  });
});
