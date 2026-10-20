import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(
  `create schema auth;create schema extensions;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
);
for (const file of (await readdir("supabase/migrations"))
  .filter((x) => x.endsWith(".sql"))
  .sort())
  await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
const users = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
for (const u of users) await db.query("insert into auth.users values($1)", [u]);
const lid = "00000000-0000-4000-8000-000000000001";
await db.query(
  `insert into public.listings(id,title,city,category,summary,origin,publication_status) values($1,'Тестовая идея','semey','Наследие','Синтетический пример для тестирования','demo_fixture','published')`,
  [lid],
);
async function asUser(u, fn) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    u ?? "",
  ]);
  await db.exec(`set role ${u ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
const rpc = async (name, args = []) => {
  const result = await db.query(
    `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
    args,
  );
  return result.rows[0].value;
};
let n = 0;
async function check(name, fn) {
  await fn();
  n++;
  console.log("PASS", name);
}
const future = new Date(Date.now() + 86400000 * 10).toISOString();
let pid, token, gid;
await check("atomic plan + group + idempotency", async () =>
  asUser(users[0], async () => {
    const args = [
      lid,
      "План друзей",
      future,
      "У входа",
      "20000000-0000-4000-8000-000000000001",
    ];
    pid = await rpc("create_plan", args);
    assert.equal(await rpc("create_plan", args), pid);
    const room = await rpc("get_room", [pid]);
    gid = room.plan.group_id;
    assert.equal(room.members.length, 1);
  }),
);
await check("outsider cannot read private room or tables", async () =>
  asUser(users[2], async () => {
    await assert.rejects(() => rpc("get_room", [pid]), /NOT_FOUND/);
    assert.equal((await db.query("select * from public.plans")).rows.length, 0);
    await assert.rejects(
      () =>
        db.query("insert into public.group_members values($1,$2,$3)", [
          gid,
          users[2],
          "active",
        ]),
      /permission denied/,
    );
  }),
);
await check("draft RSVP blocked, publish requires owner", async () => {
  await asUser(users[0], async () => {
    await assert.rejects(
      () => rpc("set_rsvp", [pid, 1, "going"]),
      /INVALID_TRANSITION/,
    );
    await rpc("plan_action", [pid, 1, "publish", {}]);
    token = (await rpc("create_invitation", [pid, "Пойдём вместе"])).token;
  });
});
await check("preview exposes only explicitly allowed fields", async () =>
  asUser(null, async () => {
    const preview = await rpc("preview_invitation", [token]);
    assert.deepEqual(Object.keys(preview).sort(), ["expires_at", "title"]);
    await assert.rejects(
      () => db.query("select * from public.plans"),
      /permission denied/,
    );
    await assert.rejects(
      () => rpc("redeem_invitation", [token]),
      /permission denied/,
    );
  }),
);
await check("redeem creates member and is idempotent", async () =>
  asUser(users[1], async () => {
    assert.equal(await rpc("redeem_invitation", [token]), pid);
    assert.equal(await rpc("redeem_invitation", [token]), pid);
    await rpc("set_rsvp", [pid, 1, "going"]);
  }),
);
await check("only owner can confirm; current going required", async () => {
  await asUser(users[1], async () => {
    await assert.rejects(
      () => rpc("plan_action", [pid, 1, "confirm", {}]),
      /FORBIDDEN/,
    );
  });
  await asUser(users[0], async () => {
    await rpc("set_rsvp", [pid, 1, "going"]);
    await rpc("plan_action", [pid, 1, "confirm", {}]);
    assert.equal((await rpc("get_room", [pid])).plan.status, "confirmed");
  });
});
await check(
  "version change makes old RSVP stale; stale mutation rejected",
  async () =>
    asUser(users[0], async () => {
      await rpc("plan_action", [
        pid,
        1,
        "revise",
        { starts_at: new Date(Date.now() + 86400000 * 11).toISOString() },
      ]);
      await assert.rejects(
        () => rpc("set_rsvp", [pid, 1, "going"]),
        /VERSION_CONFLICT/,
      );
      const r = await rpc("get_room", [pid]);
      assert.equal(r.plan.version, 2);
      assert.equal(r.rsvps[0].acknowledged_version, 1);
      await rpc("set_rsvp", [pid, 2, "going"]);
    }),
);
await check("budget shares conserve every minor unit", async () => {
  await asUser(users[1], () => rpc("set_rsvp", [pid, 2, "going"]));
  await asUser(users[0], async () => {
    await rpc("add_budget_item", [pid, 2, "Транспорт", "10001", "shared"]);
    await rpc("recalculate_budget", [pid, 2]);
    const r = await rpc("get_room", [pid]);
    assert.equal(r.budget.total_minor, "10001");
    assert.equal(
      Object.values(r.budget.shares).reduce((a, b) => a + BigInt(b), 0n),
      10001n,
    );
    assert.equal(r.budget.shares[users[0]], "5001");
  });
});
await check("budget agreement checks current composition", async () => {
  await asUser(users[1], () => rpc("set_rsvp", [pid, 2, "maybe"]));
  await asUser(users[0], async () => {
    await assert.rejects(() => rpc("agree_budget", [pid, 1]), /BUDGET_STALE/);
    await rpc("recalculate_budget", [pid, 2]);
    await rpc("agree_budget", [pid, 2]);
  });
});
await check("message idempotency", async () =>
  asUser(users[0], async () => {
    const args = [
      pid,
      "Встречаемся у входа",
      "30000000-0000-4000-8000-000000000001",
    ];
    await rpc("send_message", args);
    await rpc("send_message", args);
    assert.equal((await rpc("get_room", [pid])).messages.length, 1);
  }),
);
await check("removal revokes all access and old redemption", async () => {
  await asUser(users[0], () => rpc("remove_member", [pid, users[1]]));
  await asUser(users[1], async () => {
    await assert.rejects(() => rpc("get_room", [pid]), /NOT_FOUND/);
    await assert.rejects(
      () => rpc("redeem_invitation", [token]),
      /INVALID_INVITATION/,
    );
    assert.equal(
      (await db.query("select * from public.room_messages")).rows.length,
      0,
    );
  });
});
await check("revoked link cannot redeem", async () => {
  await asUser(users[0], async () => {
    const i = await rpc("create_invitation", [pid, "Новое приглашение"]);
    await rpc("revoke_invitation", [i.id]);
    token = i.token;
  });
  await asUser(users[2], () =>
    assert.rejects(
      () => rpc("redeem_invitation", [token]),
      /INVALID_INVITATION/,
    ),
  );
});
await check("UGC private until moderation, no self promotion", async () => {
  let submission;
  await asUser(users[1], async () => {
    submission = await rpc("submit_listing", [
      {
        title: "Новое место",
        city: "almaty",
        category: "Музеи",
        summary: "Пользовательское описание для проверки",
        address: "Публичный адрес",
        rights: true,
      },
    ]);
    await assert.rejects(
      () => rpc("review_listing", [submission, true, ""]),
      /FORBIDDEN/,
    );
    assert.equal(
      (
        await db.query("select id from public.listings where id=$1", [
          submission,
        ])
      ).rows.length,
      0,
    );
  });
  await db.query("insert into private.admin_roles values($1)", [users[0]]);
  await asUser(users[0], () => rpc("review_listing", [submission, true, ""]));
  await asUser(null, async () =>
    assert.equal(
      (
        await db.query("select id from public.listings where id=$1", [
          submission,
        ])
      ).rows.length,
      1,
    ),
  );
});
await check("no client write or access to private tables", async () =>
  asUser(users[1], async () => {
    await assert.rejects(
      () => db.exec("select * from private.invitations"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.exec("select * from private.admin_roles"),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update public.groups set owner_id=$1", [users[1]]),
      /permission denied/,
    );
  }),
);
await check("null expected version cannot bypass concurrency checks", () =>
  asUser(users[0], async () => {
    await assert.rejects(
      () => rpc("set_rsvp", [pid, null, "going"]),
      /VERSION_CONFLICT/,
    );
    await assert.rejects(
      () => rpc("plan_action", [pid, null, "edit", {}]),
      /VERSION_CONFLICT/,
    );
  }),
);
await check(
  "owner can add another plan to same company; removed user cannot",
  async () => {
    await asUser(users[0], async () => {
      const second = await rpc("create_plan", [
        lid,
        "Второе предложение",
        future,
        "Встреча у входа",
        "20000000-0000-4000-8000-000000000009",
        gid,
      ]);
      assert.equal((await rpc("get_room", [second])).plan.group_id, gid);
    });
    await asUser(users[1], () =>
      assert.rejects(
        () =>
          rpc("create_plan", [
            lid,
            "Чужой план",
            future,
            "У входа",
            "20000000-0000-4000-8000-000000000010",
            gid,
          ]),
        /FORBIDDEN/,
      ),
    );
  },
);
await check(
  "draft → review → publish → edit withdraws publication",
  async () => {
    let id;
    const values = {
      title: "Демо событие",
      city: "semey",
      category: "Наследие",
      summary: "Демонстрационный текст события",
      address: "Общественная площадка",
      kind: "event",
      event_starts: future,
      rights: true,
    };
    await asUser(users[1], async () => {
      id = await rpc("submit_listing", [{ ...values, action: "draft" }]);
      assert.equal(
        (await rpc("my_submissions")).find((x) => x.id === id)
          .publication_status,
        "draft",
      );
      await rpc("submit_listing", [{ ...values, id }]);
    });
    await asUser(users[0], () => rpc("review_listing", [id, true, ""]));
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.listings where id=$1", [id]))
          .rows.length,
        1,
      ),
    );
    await asUser(users[1], () =>
      rpc("submit_listing", [{ ...values, id, action: "draft" }]),
    );
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.listings where id=$1", [id]))
          .rows.length,
        0,
      ),
    );
  },
);
await check("editor cannot approve their own UGC", async () =>
  asUser(users[0], async () => {
    const id = await rpc("submit_listing", [
      {
        title: "Своя публикация",
        city: "semey",
        category: "Музеи",
        summary: "Описание своего предложения",
        rights: true,
      },
    ]);
    await assert.rejects(
      () => rpc("review_listing", [id, true, ""]),
      /FORBIDDEN/,
    );
  }),
);
await check("editor source check audited and outsider denied", async () => {
  const values = {
    title: "Демо редакторская карточка",
    city: "semey",
    category: "Музеи",
    summary: "Закрытый черновик для проверки редактора",
    source_url: "https://example.com/",
    publication_status: "draft",
  };
  await asUser(users[2], () =>
    assert.rejects(() => rpc("save_catalog", [values]), /FORBIDDEN/),
  );
  await asUser(users[0], async () =>
    assert.ok(await rpc("save_catalog", [values])),
  );
});
await check(
  "cursor pagination has no gaps for identical timestamps",
  async () => {
    await db.query("delete from public.room_messages where group_id=$1", [gid]);
    for (let i = 0; i < 65; i++)
      await db.query(
        "insert into public.room_messages(group_id,author_id,body,request_id,created_at) values($1,$2,$3,gen_random_uuid(),'2026-10-20T00:00:00Z')",
        [gid, users[0], "Сообщение " + i],
      );
    await asUser(users[0], async () => {
      const first = await rpc("message_page", [pid]);
      assert.equal(first.items.length, 50);
      assert.equal(first.has_more, true);
      const oldest = first.items[0];
      const second = await rpc("message_page", [
        pid,
        oldest.created_at,
        oldest.id,
      ]);
      assert.equal(second.items.length, 15);
      assert.equal(
        new Set([...first.items, ...second.items].map((x) => x.id)).size,
        65,
      );
    });
  },
);
await check("public API contains no elevated implementation", async () => {
  const r = await db.query(
    "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
  );
  assert.equal(r.rows[0].n, 0);
});
let providerId, offerId, requestId;
const providerInput = {
  kind: "guide",
  city: "semey",
  name: "Демо · гид",
  description: "Синтетический профиль для проверки заявок",
  languages: "Русский",
  phone: "+70000000001",
  publish_contacts: true,
};
const offerInput = {
  kind: "excursion",
  title: "Демо · экскурсия",
  program: "Синтетическая программа экскурсии",
  included: "Экскурсия",
  excluded: "Транспорт",
  departure: "Демо · у музея",
  duration_minutes: 180,
  min_guests: 1,
  max_guests: 4,
  price_minor: "10000",
  price_basis: "person",
  cancellation: "Согласовать отмену до поездки",
  listing_id: lid,
};
await check(
  "provider submission hides contacts until independent moderation",
  async () => {
    providerId = await asUser(users[1], () =>
      rpc("save_provider", [providerInput]),
    );
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.providers where managed=true"))
          .rows.length,
        0,
      ),
    );
    await asUser(users[2], () =>
      assert.rejects(
        rpc("save_provider", [
          { ...providerInput, id: providerId, version: 1 },
        ]),
        /FORBIDDEN/,
      ),
    );
    await asUser(users[0], () =>
      rpc("review_partner", ["provider", providerId, 1, true]),
    );
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.providers where managed=true"))
          .rows.length,
        1,
      ),
    );
  },
);
await check(
  "provider cannot self-publish even with editor role; offers require review",
  async () => {
    offerId = await asUser(users[1], () =>
      rpc("save_offer", [{ ...offerInput, provider_id: providerId }]),
    );
    await db.query(
      "insert into private.admin_roles values($1) on conflict do nothing",
      [users[1]],
    );
    await asUser(users[1], () =>
      assert.rejects(
        rpc("review_partner", ["offer", offerId, 1, true]),
        /SELF_REVIEW/,
      ),
    );
    await db.query("delete from private.admin_roles where user_id=$1", [
      users[1],
    ]);
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.service_offers")).rows.length,
        0,
      ),
    );
    await asUser(users[0], () =>
      rpc("review_partner", ["offer", offerId, 1, true]),
    );
  },
);
const requestInput = () => ({
  offer_id: offerId,
  offer_version: 2,
  guests: 1,
  starts_at: future,
  contact_name: "Демо клиент",
  contact_phone: "+70000000002",
  contact_consent: true,
  note: "Тест",
  request_key: randomUUID(),
});
await check(
  "solo request works with one guest, consent, current offer and idempotency",
  async () => {
    const input = requestInput();
    requestId = await asUser(users[0], () => rpc("send_trip_request", [input]));
    await asUser(users[0], async () => {
      assert.equal(await rpc("send_trip_request", [input]), requestId);
      await assert.rejects(
        rpc("send_trip_request", [{ ...input, guests: 2 }]),
        /VERSION_CONFLICT/,
      );
      await assert.rejects(
        rpc("send_trip_request", [
          { ...requestInput(), contact_consent: false },
        ]),
        /CONTACT_CONSENT_REQUIRED/,
      );
      await assert.rejects(
        rpc("send_trip_request", [{ ...requestInput(), offer_version: null }]),
        /VERSION_CONFLICT/,
      );
    });
  },
);
await check(
  "request contacts and history are private; response roles and versions enforced",
  async () => {
    await asUser(users[2], async () => {
      assert.deepEqual(await rpc("my_trip_requests"), []);
      await assert.rejects(
        db.query("select contact_phone from public.trip_requests"),
        /permission denied/,
      );
      await assert.rejects(
        rpc("respond_trip_request", [
          requestId,
          1,
          "propose",
          future,
          20000,
          "Тест",
        ]),
        /NOT_FOUND/,
      );
    });
    await asUser(users[0], () =>
      assert.rejects(
        rpc("respond_trip_request", [
          requestId,
          1,
          "propose",
          future,
          20000,
          "Тест",
        ]),
        /INVALID_TRANSITION/,
      ),
    );
    await asUser(users[1], () =>
      rpc("respond_trip_request", [
        requestId,
        1,
        "propose",
        future,
        20000,
        "Подтверждаю условия",
      ]),
    );
    await asUser(users[0], async () => {
      await assert.rejects(
        rpc("respond_trip_request", [requestId, 1, "accept"]),
        /VERSION_CONFLICT/,
      );
      await rpc("respond_trip_request", [requestId, 2, "accept"]);
      const list = await rpc("my_trip_requests");
      assert.equal(list[0].status, "confirmed");
      assert.equal(list[0].events.length, 3);
    });
  },
);
await check(
  "editing an offer withdraws it and preserves the request snapshot",
  async () => {
    await asUser(users[1], () =>
      rpc("save_offer", [
        {
          ...offerInput,
          id: offerId,
          version: 2,
          provider_id: providerId,
          title: "Демо · другая программа",
        },
      ]),
    );
    await asUser(null, async () =>
      assert.equal(
        (await db.query("select id from public.service_offers")).rows.length,
        0,
      ),
    );
    await asUser(users[0], async () => {
      const list = await rpc("my_trip_requests");
      assert.equal(list[0].offer_snapshot.title, "Демо · экскурсия");
      await assert.rejects(
        rpc("send_trip_request", [requestInput()]),
        /NOT_FOUND/,
      );
      await rpc("review_partner", ["offer", offerId, 3, true]);
    });
  },
);
let groupPlan, groupRequest;
await check(
  "group request needs owner, actual agreed count and matching date",
  async () => {
    groupPlan = await asUser(users[0], () =>
      rpc("create_plan", [
        lid,
        "Демо · группа для заявки",
        future,
        "Демо место",
        randomUUID(),
      ]),
    );
    await asUser(users[0], () => rpc("plan_action", [groupPlan, 1, "publish"]));
    const inv = await asUser(users[0], () =>
      rpc("create_invitation", [groupPlan, "Демо группа"]),
    );
    await asUser(users[2], () => rpc("redeem_invitation", [inv.token]));
    for (const u of [users[0], users[2]])
      await asUser(u, () => rpc("set_rsvp", [groupPlan, 1, "going"]));
    const input = {
      ...requestInput(),
      offer_version: 4,
      plan_id: groupPlan,
      plan_version: 1,
      guests: 2,
    };
    await asUser(users[2], () =>
      assert.rejects(rpc("send_trip_request", [input]), /FORBIDDEN/),
    );
    await asUser(users[0], async () => {
      await assert.rejects(
        rpc("send_trip_request", [{ ...input, guests: 1 }]),
        /PARTY_CHANGED/,
      );
      await assert.rejects(
        rpc("send_trip_request", [{ ...input, plan_version: null }]),
        /VERSION_CONFLICT/,
      );
      groupRequest = await rpc("send_trip_request", [input]);
      await assert.rejects(
        rpc("send_trip_request", [{ ...input, request_key: randomUUID() }]),
        /duplicate key/,
      );
    });
  },
);
await check(
  "group acceptance requires agreed budget covering quote",
  async () => {
    await asUser(users[1], () =>
      rpc("respond_trip_request", [
        groupRequest,
        1,
        "propose",
        future,
        20000,
        "Демо условия",
      ]),
    );
    await asUser(users[0], () =>
      assert.rejects(
        rpc("respond_trip_request", [groupRequest, 2, "accept"]),
        /GROUP_BUDGET_NOT_AGREED/,
      ),
    );
    await asUser(users[0], async () => {
      await rpc("add_budget_item", [groupPlan, 1, "Услуга", 20000, "shared"]);
      await rpc("recalculate_budget", [groupPlan, 1]);
      await rpc("agree_budget", [groupPlan, 1]);
    });
    await asUser(users[2], () => rpc("agree_budget", [groupPlan, 1]));
    await asUser(users[0], () =>
      rpc("respond_trip_request", [groupRequest, 2, "accept"]),
    );
  },
);
await check(
  "changed group invalidates provider proposal; cancellation permits a new request",
  async () => {
    await asUser(users[0], () =>
      rpc("respond_trip_request", [groupRequest, 3, "cancel"]),
    );
    groupRequest = await asUser(users[0], () =>
      rpc("send_trip_request", [
        {
          ...requestInput(),
          offer_version: 4,
          plan_id: groupPlan,
          plan_version: 1,
          guests: 2,
        },
      ]),
    );
    await asUser(users[1], () =>
      rpc("respond_trip_request", [
        groupRequest,
        1,
        "propose",
        future,
        20000,
        "Демо условия",
      ]),
    );
    await asUser(users[2], () => rpc("set_rsvp", [groupPlan, 1, "not_going"]));
    await asUser(users[0], () =>
      assert.rejects(
        rpc("respond_trip_request", [groupRequest, 2, "accept"]),
        /PARTY_CHANGED/,
      ),
    );
  },
);
console.log(
  `Database: ${n} checks passed (PostgreSQL WASM, real pgcrypto; Auth context shim only).`,
);
await db.close();
