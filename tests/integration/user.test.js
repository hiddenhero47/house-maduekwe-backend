jest.mock("../../server-src/helpers/emailSender", () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue({}),
  loadTemplates: jest.fn().mockResolvedValue(undefined),
}));

const request = require("supertest");
const { authenticator } = require("otplib");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");
const { createUser, createAdmin, generateToken } = require("../setup/fixtures");
const { User, ROLE } = require("../../server-src/models/userModel");
const { sendTemplatedEmail } = require("../../server-src/helpers/emailSender");

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
  jest.clearAllMocks();
});

afterAll(async () => {
  await disconnectTestDB();
});

describe("POST /api/users (register)", () => {
  it("registers a new user and returns a usable token", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Jane", email: "jane@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("basic");
    expect(res.body.token).toEqual(expect.any(String));

    const me = await request(app)
      .get("/api/users/getMe")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe("jane@example.com");
  });

  it("rejects a duplicate email", async () => {
    await createUser({ email: "dupe@example.com" });

    const res = await request(app)
      .post("/api/users")
      .send({ name: "Jane", email: "dupe@example.com", password: "password123" });

    expect(res.status).toBe(400);
  });

  it("rejects missing fields", async () => {
    const res = await request(app).post("/api/users").send({ email: "x@example.com" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/users/login", () => {
  it("logs in with correct credentials", async () => {
    const bcrypt = require("bcryptjs");
    const password = "password123";
    const user = await createUser({ password: await bcrypt.hash(password, 4) });

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("rejects a wrong password", async () => {
    const user = await createUser();

    const res = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(400);
  });

  describe("with 2FA enabled", () => {
    const login2faUser = async () => {
      const bcrypt = require("bcryptjs");
      const password = "password123";
      const secret = authenticator.generateSecret();
      const user = await createUser({
        password: await bcrypt.hash(password, 4),
        user2fa: { enable: true, secret },
      });
      return { user, password, secret };
    };

    it("requires a 2FA token", async () => {
      const { user, password } = await login2faUser();

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: user.email, password });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("2FA_REQUIRED");
    });

    it("succeeds with a valid 2FA token", async () => {
      const { user, password, secret } = await login2faUser();

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: user.email, password, token: authenticator.generate(secret) });

      expect(res.status).toBe(200);
    });

    it("rejects an invalid 2FA token", async () => {
      const { user, password } = await login2faUser();

      const res = await request(app)
        .post("/api/users/login")
        .send({ email: user.email, password, token: "000000" });

      expect(res.status).toBe(400);
    });
  });
});

describe("2FA setup flow", () => {
  it("generate -> verify -> enabled, then required at login", async () => {
    const bcrypt = require("bcryptjs");
    const password = "password123";
    const user = await createUser({ password: await bcrypt.hash(password, 4) });
    const token = generateToken(user);

    const setup = await request(app)
      .get("/api/users/2fa/setup")
      .set("Authorization", `Bearer ${token}`);

    expect(setup.status).toBe(200);
    expect(setup.body.tempSecret).toEqual(expect.any(String));

    const validCode = authenticator.generate(setup.body.tempSecret);

    const verify = await request(app)
      .post("/api/users/2fa/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ token: validCode });

    expect(verify.status).toBe(200);

    const login = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password });

    expect(login.status).toBe(400);
    expect(login.body.code).toBe("2FA_REQUIRED");
  });

  it("toggle off requires it to already be enabled", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .put("/api/users/2fa/toggle")
      .set("Authorization", `Bearer ${token}`)
      .send({ enable: false });

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/users/profile", () => {
  it("updates name and phone number", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .put("/api/users/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name", phoneNumber: { number: "5551234", country: "US" } });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
  });

  it("changes password with the correct old password, invalidating the old token", async () => {
    const bcrypt = require("bcryptjs");
    const oldPassword = "password123";
    const user = await createUser({ password: await bcrypt.hash(oldPassword, 4) });
    const token = generateToken(user);

    const res = await request(app)
      .put("/api/users/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ oldPassword, password: "newpassword456" });

    expect(res.status).toBe(200);

    // old token is now invalid (sessionId rotated)
    const staleCheck = await request(app)
      .get("/api/users/getMe")
      .set("Authorization", `Bearer ${token}`);
    expect(staleCheck.status).toBe(401);

    // new password works
    const login = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "newpassword456" });
    expect(login.status).toBe(200);
  });

  it("rejects a password change with the wrong old password", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .put("/api/users/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ oldPassword: "wrong", password: "newpassword456" });

    expect(res.status).toBe(400);
  });
});

describe("Admin user management", () => {
  it("registerAdmin requires SUPER_ADMIN", async () => {
    const admin = await createAdmin();
    const token = generateToken(admin);

    const res = await request(app)
      .post("/api/users/admin-create")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Admin", email: "admin2@example.com", password: "password123" });

    expect(res.status).toBe(401);
  });

  it("SUPER_ADMIN can create an admin", async () => {
    const superAdmin = await createUser({ role: ROLE.SUPER_ADMIN });
    const token = generateToken(superAdmin);

    const res = await request(app)
      .post("/api/users/admin-create")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Admin", email: "admin2@example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("admin");
  });

  it("getUsers lists users, filterable by role", async () => {
    const superAdmin = await createUser({ role: ROLE.SUPER_ADMIN });
    const token = generateToken(superAdmin);
    await createUser();
    await createAdmin();

    const res = await request(app)
      .get("/api/users?role=admin")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].password).toBeUndefined();
  });

  it("changeUserRole updates a basic user to admin", async () => {
    const superAdmin = await createUser({ role: ROLE.SUPER_ADMIN });
    const token = generateToken(superAdmin);
    const user = await createUser();

    const res = await request(app)
      .patch(`/api/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin");
  });

  it("cannot change your own role", async () => {
    const superAdmin = await createUser({ role: ROLE.SUPER_ADMIN });
    const token = generateToken(superAdmin);

    const res = await request(app)
      .patch(`/api/users/${superAdmin._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });

    expect(res.status).toBe(400);
  });

  // Note: changeUserRole also has a "cannot modify a SUPER_ADMIN's role"
  // guard, but it's unreachable through normal app usage — userModel.js's
  // pre-save hook enforces there can only ever be ONE Super Admin, so the
  // only possible SUPER_ADMIN target is always the caller themselves,
  // which the "cannot change your own role" test above already covers.

  it("promoting someone to superAdmin while one already exists returns 403, not 500 (regression: error.status vs error.statusCode)", async () => {
    // changeUserRole only sets the _adminCreation bypass flag for
    // role === "admin", never for "superAdmin" — so this always hits
    // userModel.js's pre-save "only one Super Admin" guard. That guard
    // used to set error.status (which errorMiddleware.js never read,
    // only error.statusCode), so this request used to come back as a
    // generic 500 instead of the intended 403.
    const superAdmin = await createUser({ role: ROLE.SUPER_ADMIN });
    const token = generateToken(superAdmin);
    const user = await createUser();

    const res = await request(app)
      .patch(`/api/users/${user._id}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "superAdmin" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Only one Super Admin can exist in the system");
  });
});

describe("Password reset flow", () => {
  it("requests, then resets, the password end to end", async () => {
    const user = await createUser();

    const requestRes = await request(app)
      .post("/api/users/request-reset")
      .send({ email: user.email });

    expect(requestRes.status).toBe(200);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(1);

    const { resetUrl } = sendTemplatedEmail.mock.calls[0][0].variables;
    const resetToken = resetUrl.split("/reset-password/")[1];

    const resetRes = await request(app)
      .post("/api/users/reset-password")
      .send({ token: resetToken, password: "brandNewPassword1" });

    expect(resetRes.status).toBe(200);

    const login = await request(app)
      .post("/api/users/login")
      .send({ email: user.email, password: "brandNewPassword1" });
    expect(login.status).toBe(200);
  });

  it("does not reveal whether the email exists", async () => {
    const res = await request(app)
      .post("/api/users/request-reset")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(app)
      .post("/api/users/reset-password")
      .send({ token: "garbage", password: "whatever123" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/users/invalidate (logout all)", () => {
  it("invalidates the current token", async () => {
    const user = await createUser();
    const token = generateToken(user);

    const res = await request(app)
      .patch("/api/users/invalidate")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const check = await request(app)
      .get("/api/users/getMe")
      .set("Authorization", `Bearer ${token}`);
    expect(check.status).toBe(401);
  });
});
