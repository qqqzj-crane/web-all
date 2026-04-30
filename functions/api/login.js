import { createSessionCookie, errorJson, json, verifyPassword } from "../_lib/auth.js";

export async function onRequestPost(context) {
  try {
    const { password } = await context.request.json();
    if (!password || !(await verifyPassword(String(password), context.env))) {
      return errorJson("密码不正确", 401);
    }
    return json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": await createSessionCookie(context.request, context.env),
        },
      },
    );
  } catch (error) {
    return errorJson(error.message || "登录失败", 400);
  }
}
