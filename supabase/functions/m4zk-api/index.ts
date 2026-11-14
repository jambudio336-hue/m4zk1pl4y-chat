import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeRateLimit, hashClientIp, issueAccessToken, verifyAccessToken } from "./_shared/security.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
const enc = new TextEncoder();
const b64u = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const un64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const decodeImageBase64 = (s: string) => {
  const clean = s.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s/g, "");
  const normalized = clean.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" } });
const now = () => Date.now();
const id = () => crypto.randomUUID();
const fail = (error: string, status = 400) => json({ error }, status);
async function createSessionToken(userId: string, req: Request, deviceLabel: unknown, ttlSeconds = 7 * 86400) {
  const sessionId = id();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const lastIpHash = await hashClientIp(forwarded);
  const { error } = await db.from("m4zk_sessions").insert({
    id: sessionId, user_id: userId, device_label: String(deviceLabel || "mobile").slice(0, 80),
    last_ip_hash: lastIpHash, created_at: now(),
  });
  if (error) throw new Error("session_create_failed");
  return { token: await issueAccessToken(userId, sessionId, ttlSeconds), sessionId };
}
async function auth(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\\s+/i, "");
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  const { data: session, error: sessionError } = await db.from("m4zk_sessions")
    .select("id,user_id").eq("id", claims.sid).eq("user_id", claims.sub)
    .is("revoked_at", null).maybeSingle();
  if (sessionError || !session) return null;
  const { data } = await db.from("m4zk_users").select("*").eq("id", claims.sub).maybeSingle();
  if (data) data._sessionId = claims.sid;
  return data || null;
}
async function enforceLimit(bucket: string, limit: number) {
  const result = await consumeRateLimit(db, bucket, limit);
  return result.allowed ? null : json({ error: "rate_limited", retryAfter: result.retryAfter }, 429);
}
async function ipBucket(req: Request, scope: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  return "ip:" + await hashClientIp(ip) + ":" + scope;
}
async function verifyEd25519(message: string, sig: string, pub: string) {
  try {
    const key = await crypto.subtle.importKey("raw", un64(pub), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, un64(sig), enc.encode(message));
  } catch { return false; }
}
const publicUser = (u: any) => ({ id:u.id, handle:u.handle, displayName:u.display_name, publicKey:u.public_key, boxPublicKey:u.box_public_key, bio:u.bio, accent:u.accent, avatarUrl:u.avatar_url ?? null, lastSeen:u.last_seen, createdAt:u.created_at });
const peerView = (u: any) => ({ id:u.id, handle:u.handle, displayName:u.display_name, boxPublicKey:u.box_public_key, accent:u.accent, bio:u.bio, avatarUrl:u.avatar_url ?? null, lastSeen:u.last_seen });
async function blocked(a: string, b: string) {
  const { data } = await db.from("m4zk_blocks").select("owner_id").or("and(owner_id.eq."+a+",peer_id.eq."+b+"),and(owner_id.eq."+b+",peer_id.eq."+a+")").limit(1);
  return !!data?.length;
}
async function accepted(a: string, b: string) {
  const { data } = await db.from("m4zk_contacts").select("id").eq("owner_id",a).eq("peer_id",b).eq("status","accepted").maybeSingle();
  return !!data;
}
async function handle(req: Request) {
  if (req.method === "OPTIONS") return json({ ok:true });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/m4zk-api/, "").replace(/^\/m4zk-api/, "").replace(/\/$/, "") || "/";
  const method = req.method;
  let body: any = {};
  if (["POST","PATCH","PUT"].includes(method)) { try { body = await req.json(); } catch { return fail("invalid_json"); } }

  if (method === "GET" && path === "/health") return json({ ok:true, service:"m4zk-api" });

  if (method === "POST" && path === "/v1/account/challenge") {
    const limited = await enforceLimit(await ipBucket(req, "challenge"), 20); if (limited) return limited;
    if (typeof body.publicKey !== "string" || un64(body.publicKey).length !== 32) return fail("invalid_public_key");
    const challenge = { id:id(), public_key:body.publicKey, nonce:b64u(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))), expires_at:now()+120000 };
    const { error } = await db.from("m4zk_challenges").insert(challenge);
    if (error) return fail("challenge_store_failed",500);
    return json({ challengeId:challenge.id, nonce:challenge.nonce, expiresAt:challenge.expires_at, message:challenge.id+":"+challenge.nonce });
  }

  if (method === "POST" && (path === "/v1/account/register" || path === "/v1/account/login")) {
    const limited = await enforceLimit(await ipBucket(req, "account"), 10); if (limited) return limited;
    const isReg = path.endsWith("register");
    let challenge: any;
    if (isReg) {
      if (!/^[a-z0-9_-]{3,24}$/.test(body.handle || "") || typeof body.displayName !== "string" || !body.displayName.trim() || body.displayName.length>48 || typeof body.publicKey!=="string" || un64(body.publicKey).length!==32 || typeof body.boxPublicKey!=="string" || un64(body.boxPublicKey).length!==32 || typeof body.signature!=="string" || typeof body.challengeId!=="string") return fail("invalid_body");
      const { data: existingHandle, error: handleLookupError } = await db.from("m4zk_users").select("id").eq("handle",body.handle).maybeSingle();
      if (handleLookupError) return fail("register_check_failed",500);
      if (existingHandle) return fail("handle_taken",409);
      const { data: existingKey, error: keyLookupError } = await db.from("m4zk_users").select("id").eq("public_key",body.publicKey).maybeSingle();
      if (keyLookupError) return fail("register_check_failed",500);
      if (existingKey) return fail("key_registered",409);
      const { data } = await db.from("m4zk_challenges").select("*").eq("id",body.challengeId).eq("public_key",body.publicKey).gt("expires_at",now()).maybeSingle();
      challenge=data;
    } else {
      const { data } = await db.from("m4zk_challenges").select("*").eq("id",body.challengeId).gt("expires_at",now()).maybeSingle();
      challenge=data;
    }
    if (!challenge) return fail("challenge_invalid");
    const { error: delErr } = await db.from("m4zk_challenges").delete().eq("id",challenge.id);
    if (delErr) return fail("challenge_invalid");
    if (!(await verifyEd25519(challenge.id+":"+challenge.nonce,body.signature,challenge.public_key))) return fail("bad_signature",401);
    let user: any;
    if (isReg) {
      user = { id:id(), handle:body.handle, display_name:body.displayName.trim(), public_key:body.publicKey, box_public_key:body.boxPublicKey, bio:"", accent:body.accent || "#FFE600", last_seen:now(), created_at:now() };
      const { error } = await db.from("m4zk_users").insert(user);
      if (error) return fail(error.code==="23505" ? "handle_taken" : "register_failed",error.code==="23505"?409:500);
    } else {
      const { data } = await db.from("m4zk_users").select("*").eq("public_key",challenge.public_key).maybeSingle();
      user=data;
      if (!user) return fail("unknown_user",404);
      await db.from("m4zk_users").update({ last_seen:now() }).eq("id",user.id);
    }
    const issued = await createSessionToken(user.id, req, body.deviceLabel);
    return json({ token:issued.token, sessionId:issued.sessionId, user:publicUser(user) }, isReg?201:200);
  }

  const me = await auth(req);
  if (!me) return fail("unauthorized",401);
  const generalLimit = await enforceLimit("user:" + me.id + ":general", 120); if (generalLimit) return generalLimit;
  await db.from("m4zk_users").update({last_seen:now()}).eq("id",me.id);

  if (path === "/v1/account/me" && method === "GET") return json({ user:publicUser(me) });
  if (path === "/v1/account/realtime-token" && method === "POST") {
    return json({ token: await issueAccessToken(me.id, me._sessionId, 3600), expiresIn: 3600 });
  }
  if (path === "/v1/account/sessions" && method === "GET") {
    const { data, error } = await db.from("m4zk_sessions").select("id,device_label,created_at")
      .eq("user_id", me.id).is("revoked_at", null).order("created_at", { ascending: false });
    if (error) return fail("sessions_failed", 500);
    return json({ sessions: (data || []).map((s:any) => ({
      id:s.id, deviceLabel:s.device_label, createdAt:s.created_at, current:s.id === me._sessionId
    })) });
  }
  const sessionMatch = path.match(/^\\/v1\\/account\\/sessions\\/([^/]+)$/);
  if (sessionMatch && method === "DELETE") {
    const { data, error } = await db.from("m4zk_sessions").update({ revoked_at: now() })
      .eq("id", sessionMatch[1]).eq("user_id", me.id).is("revoked_at", null)
      .select("id").maybeSingle();
    if (error) return fail("session_revoke_failed", 500);
    if (!data) return fail("session_not_found", 404);
    return json({ ok:true });
  }
  if (path === "/v1/account/me" && method === "PATCH") {
    const patch:any={}; if (body.displayName!==undefined) patch.display_name=String(body.displayName).slice(0,48); if(body.bio!==undefined) patch.bio=String(body.bio).slice(0,160); if(body.accent!==undefined) patch.accent=String(body.accent).slice(0,9);
    const {data,error}=await db.from("m4zk_users").update(patch).eq("id",me.id).select("*").single(); if(error)return fail("update_failed",500); return json({user:publicUser(data)});
  }
  if (path === "/v1/account/avatar" && method === "POST") {
    if (typeof body.base64 !== "string" || body.base64.length > 4_200_000) return fail("invalid_image",413);
    const mime = String(body.mimeType || "").toLowerCase();
    const extensions: Record<string,string> = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp" };
    const ext = extensions[mime];
    if (!ext) return fail("unsupported_image_type",415);
    let bytes: Uint8Array;
    try { bytes = decodeImageBase64(body.base64); } catch { return fail("invalid_image"); }
    if (!bytes.length || bytes.length > 3 * 1024 * 1024) return fail("image_too_large",413);
    const isJpeg = bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
    const isPng = bytes.length>=8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47 && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a;
    const isWebp = bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
    if ((mime==="image/jpeg"&&!isJpeg)||(mime==="image/png"&&!isPng)||(mime==="image/webp"&&!isWebp)) return fail("invalid_image_signature");
    const path = me.id + "/avatar." + ext;
    const { data: uploaded, error: uploadError } = await db.storage.from("m4zk-avatars").upload(path, bytes, { contentType:mime, cacheControl:"3600", upsert:true });
    if (uploadError || !uploaded) return fail("avatar_upload_failed",500);
    const { data: publicData } = db.storage.from("m4zk-avatars").getPublicUrl(path);
    const { data: updated, error: updateError } = await db.from("m4zk_users").update({ avatar_url:publicData.publicUrl }).eq("id",me.id).select("*").single();
    if (updateError || !updated) return fail("avatar_profile_update_failed",500);
    return json({ user:publicUser(updated) });
  }
  if (path === "/v1/account/avatar" && method === "DELETE") {
    if (me.avatar_url) {
      const marker = "/m4zk-avatars/";
      const at = String(me.avatar_url).indexOf(marker);
      if (at >= 0) await db.storage.from("m4zk-avatars").remove([decodeURIComponent(String(me.avatar_url).slice(at + marker.length).split("?")[0])]);
    }
    const { data: updated, error } = await db.from("m4zk_users").update({ avatar_url:null }).eq("id",me.id).select("*").single();
    if (error || !updated) return fail("avatar_delete_failed",500);
    return json({ user:publicUser(updated) });
  }
  if (path === "/v1/account/location" && method === "POST") {
    if(typeof body.lat!=="number"||typeof body.lng!=="number"||Math.abs(body.lat)>90||Math.abs(body.lng)>180)return fail("invalid_body");
    const {error}=await db.from("m4zk_users").update({lat:Math.round(body.lat*1000)/1000,lng:Math.round(body.lng*1000)/1000,location_at:now()}).eq("id",me.id); return error?fail("location_failed",500):json({ok:true});
  }
  if (path === "/v1/account/me" && method === "DELETE") { const {error}=await db.from("m4zk_users").delete().eq("id",me.id); return error?fail("delete_failed",500):json({ok:true}); }

  if (path === "/v1/contacts" && method === "GET") {
    const {data:out}=await db.from("m4zk_contacts").select("id,status,created_at,peer:m4zk_users!m4zk_contacts_peer_id_fkey(*)").eq("owner_id",me.id).order("created_at",{ascending:false});
    const {data:incoming}=await db.from("m4zk_contacts").select("id,status,created_at,owner:m4zk_users!m4zk_contacts_owner_id_fkey(*)").eq("peer_id",me.id).eq("status","pending").order("created_at",{ascending:false});
    const contacts=[...(out||[]).map((c:any)=>({contactId:c.id,status:c.status,direction:"outgoing",createdAt:c.created_at,peer:peerView(c.peer)})),...(incoming||[]).map((c:any)=>({contactId:c.id,status:c.status,direction:"incoming",createdAt:c.created_at,peer:peerView(c.owner)}))];
    return json({contacts});
  }
  if (path === "/v1/contacts" && method === "POST") {
    const handleName=String(body.handle||"").replace(/^@/,"").toLowerCase(); const {data:peer}=await db.from("m4zk_users").select("*").eq("handle",handleName).maybeSingle();
    if(!peer)return fail("user_not_found",404); if(peer.id===me.id)return fail("self");
    const {data:old}=await db.from("m4zk_contacts").select("*").eq("owner_id",me.id).eq("peer_id",peer.id).maybeSingle();
    if(old)return json({contactId:old.id,status:old.status,peer:peerView(peer)});
    const contactId=id(); const {data:recip}=await db.from("m4zk_contacts").select("*").eq("owner_id",peer.id).eq("peer_id",me.id).maybeSingle();
    const status=recip?"accepted":"pending";
    const {error}=await db.from("m4zk_contacts").insert({id:contactId,owner_id:me.id,peer_id:peer.id,status,created_at:now()}); if(error)return fail("contact_create_failed",500);
    if(recip) await db.from("m4zk_contacts").update({status:"accepted"}).eq("id",recip.id);
    return json({contactId,status,peer:peerView(peer)},201);
  }
  const acceptMatch=path.match(/^\/v1\/contacts\/([^/]+)\/accept$/);
  if(acceptMatch&&method==="PATCH"){
    const {data:row}=await db.from("m4zk_contacts").select("*").eq("id",acceptMatch[1]).eq("peer_id",me.id).maybeSingle(); if(!row)return fail("not_found",404);
    await db.from("m4zk_contacts").update({status:"accepted"}).eq("id",row.id); await db.from("m4zk_contacts").update({status:"accepted"}).eq("owner_id",me.id).eq("peer_id",row.owner_id); return json({ok:true});
  }
  const contactDel=path.match(/^\/v1\/contacts\/([^/]+)$/);
  if(contactDel&&method==="DELETE"){
    const {data:row}=await db.from("m4zk_contacts").select("*").eq("id",contactDel[1]).eq("owner_id",me.id).maybeSingle(); if(!row)return fail("not_found",404);
    await db.from("m4zk_contacts").delete().or("and(owner_id.eq."+me.id+",peer_id.eq."+row.peer_id+"),and(owner_id.eq."+row.peer_id+",peer_id.eq."+me.id+")"); return json({ok:true});
  }

  if(path==="/v1/messages"&&method==="POST"){
    const messageLimit = await enforceLimit("user:" + me.id + ":messages", 60); if (messageLimit) return messageLimit;
    const to=String(body.to||""); if(!to||to===me.id)return fail("self");
    if(!await accepted(me.id,to))return fail("contact_not_accepted",403); if(await blocked(me.id,to))return fail("contact_blocked",403);
    const {data:recipient}=await db.from("m4zk_users").select("id").eq("id",to).maybeSingle(); if(!recipient)return fail("user_not_found",404);
    const clientMsgId = String(body.clientMsgId || id());
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMsgId)) return fail("invalid_client_msg_id");
    const { data: duplicate } = await db.from("m4zk_messages").select("*")
      .eq("sender_id", me.id).eq("client_msg_id", clientMsgId).maybeSingle();
    if (duplicate) return json({ message: {
      id:duplicate.id, senderId:duplicate.sender_id, recipientId:duplicate.recipient_id,
      nonce:duplicate.nonce, ciphertext:duplicate.ciphertext, kind:duplicate.kind,
      createdAt:duplicate.created_at, readAt:duplicate.read_at,
      serverSeq:duplicate.server_seq, clientMsgId:duplicate.client_msg_id, status:duplicate.status
    }});
    const message={id:id(),sender_id:me.id,recipient_id:to,nonce:String(body.nonce||""),ciphertext:String(body.ciphertext||""),kind:["text","image","voice"].includes(body.kind)?body.kind:"text",created_at:now(),read_at:null,client_msg_id:clientMsgId,status:"sent"};
    const {data:stored,error}=await db.from("m4zk_messages").insert(message).select("*").single();
    if(error) {
      if (error.code === "23505") {
        const { data: raced } = await db.from("m4zk_messages").select("*")
          .eq("sender_id", me.id).eq("client_msg_id", clientMsgId).maybeSingle();
        if (raced) return json({ message: {
          id:raced.id, senderId:raced.sender_id, recipientId:raced.recipient_id,
          nonce:raced.nonce, ciphertext:raced.ciphertext, kind:raced.kind,
          createdAt:raced.created_at, readAt:raced.read_at,
          serverSeq:raced.server_seq, clientMsgId:raced.client_msg_id, status:raced.status
        }});
      }
      return fail("message_store_failed",500);
    }
    return json({message:{id:stored.id,senderId:stored.sender_id,recipientId:stored.recipient_id,nonce:stored.nonce,ciphertext:stored.ciphertext,kind:stored.kind,createdAt:stored.created_at,readAt:stored.read_at,serverSeq:stored.server_seq,clientMsgId:stored.client_msg_id,status:stored.status}},201);
  }
  const messageMatch=path.match(/^\/v1\/messages\/([^/]+)$/);
  if(messageMatch&&method==="GET"){
    const peer=messageMatch[1]; if(!await accepted(me.id,peer))return fail("contact_not_accepted",403); if(await blocked(me.id,peer))return fail("contact_blocked",403);
    let q=db.from("m4zk_messages").select("*").or("and(sender_id.eq."+me.id+",recipient_id.eq."+peer+"),and(sender_id.eq."+peer+",recipient_id.eq."+me.id+")").order("server_seq",{ascending:false}).limit(200);
    const beforeSeq=Number(url.searchParams.get("beforeSeq")||0); const before=Number(url.searchParams.get("before")||0);
    if(beforeSeq)q=q.lt("server_seq",beforeSeq); else if(before)q=q.lt("created_at",before);
    const {data,error}=await q; if(error)return fail("messages_failed",500);
    return json({messages:(data||[]).reverse().map((m:any)=>({id:m.id,senderId:m.sender_id,recipientId:m.recipient_id,nonce:m.nonce,ciphertext:m.ciphertext,kind:m.kind,createdAt:m.created_at,readAt:m.read_at,serverSeq:m.server_seq,clientMsgId:m.client_msg_id,status:m.status}))});
  }
  const readMatch=path.match(/^\/v1\/messages\/([^/]+)\/read$/);
  if(readMatch&&method==="POST"){await db.from("m4zk_messages").update({read_at:now()}).eq("recipient_id",me.id).eq("sender_id",readMatch[1]).is("read_at",null);return json({ok:true});}

  if(path==="/v1/stories"&&method==="GET"){
    const {data:mine}=await db.from("m4zk_stories").select("*").eq("user_id",me.id).gt("expires_at",now());
    const {data:shared}=await db.from("m4zk_story_recipients").select("story_id,nonce,ciphertext").eq("user_id",me.id);
    const sharedIds=(shared||[]).map((x:any)=>x.story_id);
    const {data:others}=sharedIds.length?await db.from("m4zk_stories").select("*,author:m4zk_users!m4zk_stories_user_id_fkey(handle,display_name,accent,avatar_url)").in("id",sharedIds).gt("expires_at",now()):{data:[]};
    const stories=[...(mine||[]).map((s:any)=>({id:s.id,userId:s.user_id,handle:me.handle,displayName:me.display_name,accent:me.accent,avatarUrl:me.avatar_url??null,nonce:s.nonce,ciphertext:s.ciphertext,kind:s.kind,createdAt:s.created_at,expiresAt:s.expires_at,viewCount:0,seen:false,mine:true})),...(others||[]).map((s:any)=>{const r=(shared||[]).find((x:any)=>x.story_id===s.id);return {id:s.id,userId:s.user_id,handle:s.author?.handle,displayName:s.author?.display_name,accent:s.author?.accent,avatarUrl:s.author?.avatar_url??null,nonce:r?.nonce,ciphertext:r?.ciphertext,kind:s.kind,createdAt:s.created_at,expiresAt:s.expires_at,viewCount:0,seen:false,mine:false};})];
    return json({stories});
  }
  if(path==="/v1/stories"&&method==="POST"){
    const story={id:id(),user_id:me.id,nonce:String(body.nonce||""),ciphertext:String(body.ciphertext||""),kind:body.kind==="image"?"image":"text",expires_at:now()+86400000,created_at:now()};
    const {error}=await db.from("m4zk_stories").insert(story); if(error)return fail("story_create_failed",500);
    const recipients=Array.isArray(body.recipients)?body.recipients.slice(0,500):[];
    for(const r of recipients){if(r.userId===me.id||!await accepted(me.id,r.userId)||await blocked(me.id,r.userId))continue;await db.from("m4zk_story_recipients").insert({story_id:story.id,user_id:r.userId,nonce:r.nonce,ciphertext:r.ciphertext});}
    return json({id:story.id,expiresAt:story.expires_at},201);
  }
  const viewMatch=path.match(/^\/v1\/stories\/([^/]+)\/view$/);
  if(viewMatch&&method==="POST"){
    const {data:s}=await db.from("m4zk_stories").select("*").eq("id",viewMatch[1]).gt("expires_at",now()).maybeSingle();if(!s)return fail("not_found",404);
    if(s.user_id!==me.id){const {data:r}=await db.from("m4zk_story_recipients").select("story_id").eq("story_id",s.id).eq("user_id",me.id).maybeSingle();if(!r)return fail("story_not_shared",403);await db.from("m4zk_story_views").upsert({story_id:s.id,user_id:me.id,created_at:now()},{onConflict:"story_id,user_id"});}
    return json({ok:true});
  }
  const storyDel=path.match(/^\/v1\/stories\/([^/]+)$/);
  if(storyDel&&method==="DELETE"){const {data:s}=await db.from("m4zk_stories").select("id,user_id").eq("id",storyDel[1]).maybeSingle();if(!s)return fail("not_found",404);if(s.user_id!==me.id)return fail("forbidden",403);await db.from("m4zk_stories").delete().eq("id",s.id);return json({ok:true});}

  if(path==="/v1/blocks"&&method==="GET"){
    const {data}=await db.from("m4zk_blocks").select("created_at,peer:m4zk_users!m4zk_blocks_peer_id_fkey(id,handle,display_name,accent)").eq("owner_id",me.id).order("created_at",{ascending:false});
    return json({blocked:(data||[]).map((b:any)=>({...b.peer,blockedAt:b.created_at}))});
  }
  if(path==="/v1/blocks"&&method==="POST"){
    let peer:any=null;if(body.userId){const {data}=await db.from("m4zk_users").select("*").eq("id",body.userId).maybeSingle();peer=data;}else if(body.handle){const {data}=await db.from("m4zk_users").select("*").eq("handle",String(body.handle).replace(/^@/,"").toLowerCase()).maybeSingle();peer=data;}
    if(!peer)return fail("user_not_found",404);if(peer.id===me.id)return fail("self");
    await db.from("m4zk_blocks").upsert({owner_id:me.id,peer_id:peer.id,created_at:now()},{onConflict:"owner_id,peer_id"});return json({blocked:{id:peer.id,handle:peer.handle,displayName:peer.display_name,accent:peer.accent}},201);
  }
  const unblock=path.match(/^\/v1\/blocks\/([^/]+)$/);
  if(unblock&&method==="DELETE"){await db.from("m4zk_blocks").delete().eq("owner_id",me.id).eq("peer_id",unblock[1]);return json({ok:true});}

  if(path==="/v1/nearby"&&method==="GET"){
    if(me.lat==null||me.lng==null)return json({users:[],reason:"no_location"});
    const radius=Math.min(Number(url.searchParams.get("radius")||2000),20000);
    const {data}=await db.from("m4zk_users").select("id,handle,display_name,accent,bio,avatar_url,box_public_key,last_seen,lat,lng").neq("id",me.id).gt("location_at",now()-1800000).not("lat","is",null).not("lng","is",null).limit(300);
    const rad=(v:number)=>v*Math.PI/180;const dist=(a:any,b:any)=>{const d1=rad(b.lat-a.lat),d2=rad(b.lng-a.lng),h=Math.sin(d1/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(d2/2)**2;return 12742000*Math.asin(Math.sqrt(h));};
    const users=(data||[]).map((u:any)=>({id:u.id,handle:u.handle,displayName:u.display_name,accent:u.accent,bio:u.bio,avatarUrl:u.avatar_url??null,boxPublicKey:u.box_public_key,lastSeen:u.last_seen,distance:Math.round(dist(me,u))})).filter((u:any)=>u.distance<=radius).sort((a:any,b:any)=>a.distance-b.distance).slice(0,100);
    return json({users,radius});
  }
  return fail("not_found",404);
}
Deno.serve(async (req: Request) => {
  try { return await handle(req); } catch (e) { console.error("m4zk-api error",e); return fail("internal_error",500); }
});
