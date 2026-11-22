const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

process.chdir(path.resolve(__dirname, '..'));

const examplePath = 'n8n/transkep-ai-assistant.example.json';
const livePath = 'n8n/transkep-ai-assistant.json';

assert(fs.existsSync(examplePath), `Missing ${examplePath}`);
const exampleRaw = fs.readFileSync(examplePath, 'utf8');
const exampleWf = JSON.parse(exampleRaw);

const hasLive = fs.existsSync(livePath);
const liveRaw = hasLive ? fs.readFileSync(livePath, 'utf8') : null;
const liveWf = hasLive ? JSON.parse(liveRaw) : null;

// Helper to build shared VM sandbox for n8n Code nodes
function buildCodeSandbox(opts = {}) {
  const inputJson = opts.inputJson !== undefined ? opts.inputJson : {};
  const inputBinary = opts.inputBinary;
  const inputAll = opts.inputAll;
  const nodeMap = opts.nodeMap || {};
  const nodeBinaryMap = opts.nodeBinaryMap || {};
  const nodeAllMap = opts.nodeAllMap || {};
  const staticData = opts.staticData || {};

  const defaultAll = Array.isArray(inputAll)
    ? inputAll
    : [inputBinary !== undefined ? { json: inputJson, binary: inputBinary } : { json: inputJson }];

  const getBinaryDataBuffer = opts.getBinaryDataBuffer || (async (itemIndex, propName) => {
    const entry = defaultAll[itemIndex];
    const bin = entry && entry.binary && entry.binary[propName];
    if (!bin) throw new Error(`Missing binary[${propName}] at index ${itemIndex}`);
    if (bin._buffer) return bin._buffer;
    if (typeof bin.data === 'string') return Buffer.from(bin.data, 'base64');
    return Buffer.alloc(0);
  });

  return {
    $input: {
      first: () => defaultAll[0] || { json: {} },
      all: () => defaultAll,
    },
    $: (refName) => {
      if (opts.strictNodes && !(refName in nodeMap) && !(refName in nodeAllMap) && !(refName in nodeBinaryMap)) {
        throw new Error(`Node '${refName}' has not been executed`);
      }
      if (Array.isArray(nodeAllMap[refName])) {
        const list = nodeAllMap[refName];
        return {
          first: () => list[0] || { json: {} },
          item: list[0] || { json: {} },
          all: () => list,
        };
      }
      const val = nodeMap[refName] || {};
      const binVal = nodeBinaryMap[refName];
      const itemObj = binVal !== undefined ? { json: val, binary: binVal } : { json: val };
      return {
        first: () => itemObj,
        item: itemObj,
        all: () => [itemObj],
      };
    },
    $getWorkflowStaticData: (scope) => {
      if (scope === 'global') return staticData;
      return {};
    },
    helpers: {
      getBinaryDataBuffer,
    },
    Buffer,
    Intl,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    JSON,
    Math,
    RegExp,
  };
}

// Helper to run any sync n8n Code node inside an isolated vm context
function runCodeNode(wf, nodeName, opts = {}) {
  const node = wf.nodes.find((n) => n.name === nodeName);
  assert(node && node.parameters && typeof node.parameters.jsCode === 'string', `Missing Code node: ${nodeName}`);
  const sandbox = buildCodeSandbox(opts);
  const wrappedCode = `(function() {\n${node.parameters.jsCode}\n}).call({ helpers: helpers })`;
  const script = new vm.Script(wrappedCode, { filename: `${nodeName}.vm.js` });
  return script.runInNewContext(sandbox);
}

// Helper to run any async n8n Code node (using top-level await + this.helpers)
async function runCodeNodeAsync(wf, nodeName, opts = {}) {
  const node = wf.nodes.find((n) => n.name === nodeName);
  assert(node && node.parameters && typeof node.parameters.jsCode === 'string', `Missing Code node: ${nodeName}`);
  const sandbox = buildCodeSandbox(opts);
  const wrappedCode = `(async function() {\n${node.parameters.jsCode}\n}).call({ helpers: helpers })`;
  const script = new vm.Script(wrappedCode, { filename: `${nodeName}.async.vm.js` });
  return await script.runInNewContext(sandbox);
}

// 1. Validate Workflow Topology, Expressions, Naming & Model Configuration
function validateWorkflowTopology(wf, rawText, label) {
  assert.strictEqual(wf.name, 'Transkep AI Assistant', `${label}: workflow name must be 'Transkep AI Assistant'`);
  assert(!/zet+bot+/i.test(rawText), `${label}: must not contain ZettBOT/zetbott branding anywhere`);
  assert(!rawText.includes('.item.json'), `${label}: avoid fragile .item.json references after async/branch nodes; use .first().json or direct $json`);

  const byName = new Map();
  const byId = new Map();
  for (const n of wf.nodes) {
    assert(n.id && !byId.has(n.id), `${label}: duplicate/missing node id on ${n.name}`);
    assert(n.name && !byName.has(n.name), `${label}: duplicate/missing node name ${n.name}`);
    byId.set(n.id, n);
    byName.set(n.name, n);
  }

  for (const [srcName, connGroups] of Object.entries(wf.connections || {})) {
    assert(byName.has(srcName), `${label}: connection source '${srcName}' missing from nodes`);
    for (const [connType, outputs] of Object.entries(connGroups)) {
      assert(Array.isArray(outputs), `${label}: connection '${srcName}.${connType}' must be array`);
      for (const branch of outputs) {
        for (const edge of branch) {
          assert(byName.has(edge.node), `${label}: connection target '${edge.node}' from '${srcName}' missing from nodes`);
        }
      }
    }
  }

  const routerNode = byName.get('Router Perintah (AI vs Docker vs Menu)');
  assert(routerNode && routerNode.type === 'n8n-nodes-base.switch', `${label}: missing Router Switch node`);
  assert.strictEqual(routerNode.parameters.fallbackOutput, 0, `${label}: Switch fallbackOutput must be 0 (ai_chat)`);
  const routerConns = wf.connections['Router Perintah (AI vs Docker vs Menu)'].main;
  assert.strictEqual(routerConns.length, 3, `${label}: Router must have 3 branches (ai_chat, docker, quick_reply)`);

  const ifDockerAi = byName.get('Analisa Docker dengan AI? (IF)');
  assert(ifDockerAi && ifDockerAi.type === 'n8n-nodes-base.if', `${label}: missing Analisa Docker dengan AI? (IF)`);
  const ifDockerConns = wf.connections['Analisa Docker dengan AI? (IF)'].main;
  assert.strictEqual(ifDockerConns.length, 2, `${label}: IF node must have true (AI) and false (direct report) branches`);

  const geminiNode = byName.get('Google Gemini Chat Model');
  assert(geminiNode, `${label}: missing Google Gemini Chat Model node`);
  assert.strictEqual(
    geminiNode.parameters.modelName,
    'models/gemini-3.8-flash',
    `${label}: must use valid models/gemini-3.8-flash (not gemini-4-hydrogen)`
  );

  const stopTypingNode = byName.get('WAHA Stop Typing');
  const stopChatParam = stopTypingNode.parameters.bodyParameters.parameters.find((p) => p.name === 'chatId');
  assert(
    stopChatParam && stopChatParam.value.includes("$('Context & Router Transkep (Code)').first().json.replyChatId"),
    `${label}: WAHA Stop Typing must dynamically bind replyChatId`
  );

  const sshNode = byName.get('SSH Cek Kontainer Docker');
  assert(sshNode && sshNode.continueOnFail === true, `${label}: SSH node must have continueOnFail: true`);
  assert.strictEqual(
    sshNode.parameters.cwd,
    '={{ "" }}',
    `${label}: SSH cwd must evaluate to empty string so node-ssh does not prepend Unix 'cd . ;' onto Windows cmd.exe`
  );
  assert.strictEqual(
    sshNode.parameters.command,
    'docker ps -a --format json',
    `${label}: SSH ps command must avoid quotes/pipes/operators for clean Windows OpenSSH execution`
  );

  const sshOkIf = byName.get('SSH Berhasil? (IF)');
  assert(sshOkIf && sshOkIf.type === 'n8n-nodes-base.if', `${label}: missing SSH Berhasil? (IF)`);
  assert.strictEqual(wf.connections['SSH Berhasil? (IF)'].main.length, 2, `${label}: SSH Berhasil? IF must have true & false branches`);

  const sshStatsNode = byName.get('SSH Cek Resource Docker');
  assert(sshStatsNode && sshStatsNode.continueOnFail === true, `${label}: SSH stats node must have continueOnFail: true`);
  assert.strictEqual(sshStatsNode.parameters.cwd, '={{ "" }}', `${label}: SSH stats cwd must evaluate to empty string`);
  assert.strictEqual(
    sshStatsNode.parameters.command,
    'docker stats --no-stream --format json',
    `${label}: SSH stats command must use zero-quote --format json`
  );

  const agentNode = byName.get('Transkep AI Agent');
  assert(agentNode && agentNode.type === '@n8n/n8n-nodes-langchain.agent', `${label}: missing Transkep AI Agent`);
  assert.strictEqual(agentNode.parameters.text, '={{ $json.cleanPrompt }}', `${label}: Agent text must bind directly to $json.cleanPrompt`);
  assert.strictEqual(
    agentNode.parameters.options.systemMessage,
    '={{ $json.fullSystemPrompt }}',
    `${label}: Agent systemMessage must bind directly to $json.fullSystemPrompt`
  );
  assert(wf.connections['Google Gemini Chat Model'].ai_languageModel[0][0].node === 'Transkep AI Agent');
  assert(wf.connections['Memori Percakapan (20 Chat)'].ai_memory[0][0].node === 'Transkep AI Agent');

  // Ensure every Code node compiles cleanly
  for (const n of wf.nodes) {
    if (n.type === 'n8n-nodes-base.code') {
      new vm.Script(`(function(){\n${n.parameters.jsCode}\n})()`, { filename: `${label}:${n.name}` });
    }
  }
}

validateWorkflowTopology(exampleWf, exampleRaw, 'transkep-ai-assistant.example.json');
if (hasLive) {
  validateWorkflowTopology(liveWf, liveRaw, 'transkep-ai-assistant.json');

  // Verify zero unsanitized placeholders remain in live local JSON
  assert(!/<GANTI_[A-Z0-9_]+>/.test(liveRaw), 'Live transkep-ai-assistant.json must not contain <GANTI_...> placeholders');

  // Verify parity between live & example workflow structure
  assert.strictEqual(liveWf.nodes.length, exampleWf.nodes.length, 'Live & example workflows must have identical node count');
  for (let i = 0; i < liveWf.nodes.length; i++) {
    assert.strictEqual(liveWf.nodes[i].name, exampleWf.nodes[i].name, `Node name mismatch at index ${i}`);
    assert.strictEqual(liveWf.nodes[i].type, exampleWf.nodes[i].type, `Node type mismatch at index ${i}`);
  }
  assert.deepStrictEqual(liveWf.connections, exampleWf.connections, 'Live & example workflow connections must be identical');
}

// Verify required sanitization placeholders exist in .example.json
for (const ph of [
  '<GANTI_WA_ADMIN_CHAT_ID>',
  '<GANTI_NO_WA_ADMIN_TANPA_NOL>',
  '<GANTI_NO_WA_BOT>',
  '<GANTI_WAHA_API_KEY>',
  '<GANTI_GEMINI_CREDENTIAL_ID>',
  '<GANTI_SSH_CREDENTIAL_ID>',
  '<GANTI_N8N_INSTANCE_ID>',
  '<GANTI_WORKFLOW_ID>',
]) {
  assert(exampleRaw.includes(ph), `Example blueprint missing placeholder: ${ph}`);
}
console.log('[PASS] Workflow topology, model version, Transkep branding & blueprint parity checks passed.');

// 2. Behavioral VM Simulations against actual workflow Code nodes
function runBehaviorSuite(wf, opts) {
  const { adminChatId, adminDigitsNoZero, botPhone, label } = opts;

  function makeWebhookEvent(overrides = {}) {
    return {
      body: {
        event: overrides.event !== undefined ? overrides.event : 'message',
        payload: {
          id: 'msg-001',
          from: overrides.from !== undefined ? overrides.from : adminChatId,
          senderPn: overrides.from === undefined ? adminDigitsNoZero : overrides.senderPn,
          fromMe: overrides.fromMe !== undefined ? overrides.fromMe : false,
          body: overrides.body !== undefined ? overrides.body : 'Halo Transkep AI!',
          notifyName: overrides.notifyName !== undefined ? overrides.notifyName : 'Admin',
          _data: overrides._data || {},
        },
      },
    };
  }

  // Test A: Manual Trigger defaults & direct AI chat prep + WA formatting
  {
    const staticData = {};
    const res = runCodeNode(wf, 'Context & Router Transkep (Code)', { inputJson: {}, staticData });
    const ctx = res[0].json;
    assert.strictEqual(ctx.isAuthorized, true, `${label}: manual test should be authorized`);
    assert.strictEqual(ctx.routeType, 'ai_chat', `${label}: manual test default route should be ai_chat`);
    assert.strictEqual(ctx.sessionId, 'transkep_ai_session_e1');
    assert(ctx.fullSystemPrompt.includes('Transkep AI'), `${label}: system prompt must identify as Transkep AI`);

    const prepOut = runCodeNode(wf, 'Siapkan Input AI Langsung (Code)', {
      nodeMap: { 'Context & Router Transkep (Code)': ctx },
    })[0].json;
    assert.strictEqual(prepOut.cleanPrompt, ctx.cleanPrompt);

    const waOut = runCodeNode(wf, 'Format Balasan Transkep AI (Code)', {
      inputJson: { output: '## Ringkasan\n**Status Aman** dan ### Langkah Berikutnya' },
      nodeMap: { 'Context & Router Transkep (Code)': ctx },
    })[0].json;
    assert(waOut.replyText.includes('🔷 Ringkasan'), `${label}: should convert ## heading`);
    assert(waOut.replyText.includes('*Status Aman*'), `${label}: should convert **bold** to *bold*`);
    assert(!waOut.replyText.includes('**'), `${label}: must strip double asterisks`);
    assert(waOut.replyText.includes('Transkep AI Assistant'), `${label}: footer must brand Transkep AI`);
  }

  // Test B: Conceptual Docker question must go to AI Chat, NOT SSH!
  {
    const ctx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: 'Jelaskan kelebihan docker dibanding virtual machine dalam 3 poin' }),
    })[0].json;
    assert.strictEqual(ctx.isAuthorized, true);
    assert.strictEqual(ctx.routeType, 'ai_chat', `${label}: conceptual docker question should route to ai_chat`);
  }

  // Test C: Natural Indonesian Docker query & slash Docker commands -> instant report (wantsAiDockerAnalysis=false)
  for (const dockerMsg of [
    'kontainer apa saja yang jalan di docker',
    'cek docker sekarang',
    'docker ps',
    '/docker',
    '/server',
    '/status',
    '!server',
  ]) {
    const ctx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: dockerMsg }),
    })[0].json;
    assert.strictEqual(ctx.isAuthorized, true, `${label}: '${dockerMsg}' should be authorized`);
    assert.strictEqual(ctx.routeType, 'docker', `${label}: '${dockerMsg}' must route to docker`);
    assert.strictEqual(ctx.wantsAiDockerAnalysis, false, `${label}: '${dockerMsg}' should use direct report without AI`);
  }

  // Test D: SSH Output Parsing (NDJSON from docker --format json, Legacy Pipe Fallback, Missing Stats, & SSH Win32 Error Hint)
  {
    const dockerCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: 'kontainer apa saja yang jalan di docker' }),
    })[0].json;

    const psNdjson = [
      JSON.stringify({
        Names: 'transkep-n8n',
        State: 'running',
        Status: 'Up 3 days',
        Image: 'n8nio/n8n:latest',
        Ports: '0.0.0.0:5678->5678/tcp, [::]:5678->5678/tcp',
      }),
      JSON.stringify({
        Names: 'transkep-waha',
        State: 'running',
        Status: 'Up 3 days (healthy)',
        Image: 'devlikeapro/waha:latest',
        Ports: '0.0.0.0:3000->3000/tcp',
      }),
      JSON.stringify({
        Names: 'transkep-temp-job',
        State: 'exited',
        Status: 'Exited (1) 2 hours ago',
        Image: 'alpine:3.19',
        Ports: '',
      }),
    ].join('\r\n');

    const statsNdjson = [
      JSON.stringify({ Name: 'transkep-n8n', CPUPerc: '2.15%', MemUsage: '210MiB / 8GiB' }),
      JSON.stringify({ Name: 'transkep-waha', CPUPerc: '1.04%', MemUsage: '180MiB / 8GiB' }),
    ].join('\r\n');

    const reportOut = runCodeNode(wf, 'Format Laporan Kontainer Docker (Code)', {
      inputJson: { stdout: statsNdjson, stderr: '', code: 0 },
      nodeMap: {
        'Context & Router Transkep (Code)': dockerCtx,
        'SSH Cek Kontainer Docker': { stdout: psNdjson, stderr: '', code: 0 },
        'SSH Cek Resource Docker': { stdout: statsNdjson, stderr: '', code: 0 },
      },
    })[0].json;

    assert(reportOut.replyText.includes('Berjalan: *2*'), `${label}: must count 2 running containers`);
    assert(reportOut.replyText.includes('Berhenti/Lainnya: *1*'), `${label}: must count 1 stopped container`);
    assert(reportOut.replyText.includes('Total: *3*'), `${label}: must count 3 total containers`);
    assert(reportOut.replyText.includes('*transkep-n8n*'), `${label}: must list transkep-n8n`);
    assert(reportOut.replyText.includes('CPU: 2.15% | RAM: 210MiB / 8GiB'), `${label}: must include NDJSON stats`);
    assert(reportOut.replyText.includes('Port: 5678->5678/tcp') && !reportOut.replyText.includes('[::]:5678'), `${label}: must deduplicate IPv6/IPv4 ports`);
    assert(reportOut.replyText.includes('*transkep-temp-job* [exited]'), `${label}: must highlight exited container`);

    const errOut = runCodeNode(wf, 'Format Laporan Kontainer Docker (Code)', {
      inputJson: { stderr: 'The filename, directory name, or volume label syntax is incorrect.', code: 1 },
      nodeMap: {
        'Context & Router Transkep (Code)': dockerCtx,
        'SSH Cek Kontainer Docker': { stderr: 'The filename, directory name, or volume label syntax is incorrect.', code: 1 },
      },
    })[0].json;
    assert(errOut.replyText.includes('Gagal mengambil data Docker via SSH'), `${label}: SSH error must render diagnostic message`);
    assert(errOut.replyText.includes('Diagnosa Windows OpenSSH'), `${label}: Win32 Error 123 must include targeted Windows OpenSSH hint`);

    const noStatsOut = runCodeNode(wf, 'Format Laporan Kontainer Docker (Code)', {
      inputJson: {
        stdout: 'transkep-n8n|running|Up 1 hour|n8nio/n8n|\n---STATS--- \nNO_STATS',
        stderr: '',
        code: 0,
      },
      nodeMap: { 'Context & Router Transkep (Code)': dockerCtx },
    })[0].json;
    assert(noStatsOut.replyText.includes('CPU: - | RAM: -'), `${label}: legacy NO_STATS fallback must render '-' safely`);
  }

  // Test E: Docker + AI Analysis Routing & SSH-to-AI Prompt Injection
  for (const aiDockerMsg of ['/analisa docker', '/docker kenapa waha lambat?', 'analisa kenapa kontainer exited di docker']) {
    const ctx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: aiDockerMsg }),
    })[0].json;
    assert.strictEqual(ctx.routeType, 'docker', `${label}: '${aiDockerMsg}' must fetch SSH first`);
    assert.strictEqual(ctx.wantsAiDockerAnalysis, true, `${label}: '${aiDockerMsg}' must set wantsAiDockerAnalysis=true`);

    const merged = runCodeNode(wf, 'Gabung Data Docker & Prompt AI (Code)', {
      inputJson: {},
      nodeMap: {
        'Context & Router Transkep (Code)': ctx,
        'SSH Cek Kontainer Docker': {
          stdout: JSON.stringify({ Names: 'transkep-n8n', State: 'running', Status: 'Up 5 hours', Image: 'n8nio/n8n', Ports: '5678->5678/tcp' }),
        },
        'SSH Cek Resource Docker': {
          stdout: JSON.stringify({ Name: 'transkep-n8n', CPUPerc: '5.0%', MemUsage: '300MiB / 8GiB' }),
        },
      },
    })[0].json;
    assert(merged.cleanPrompt.includes('transkep-n8n') && merged.cleanPrompt.includes('300MiB / 8GiB'));
    assert(merged.fullSystemPrompt.includes('Transkep AI'));
  }

  // Test F: Specialized Modes (/sk, /sop, /notulen) & Quick Replies (/menu, /reset epoch increment)
  {
    const skCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: '/sk Pembentukan Tim IT' }),
    })[0].json;
    assert.strictEqual(skCtx.routeType, 'ai_chat');
    assert.strictEqual(skCtx.cleanPrompt, 'Pembentukan Tim IT');
    assert(skCtx.fullSystemPrompt.includes('Surat Keputusan'));

    const bareSopCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: '/sop' }),
    })[0].json;
    assert.strictEqual(bareSopCtx.routeType, 'ai_chat');
    assert(bareSopCtx.cleanPrompt.length > 10);

    const staticData = {};
    const menuCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: '/menu' }),
      staticData,
    })[0].json;
    assert.strictEqual(menuCtx.routeType, 'quick_reply');
    assert.strictEqual(menuCtx.quickAction, 'menu');
    const menuReply = runCodeNode(wf, 'Siapkan Balasan Cepat (Code)', {
      nodeMap: { 'Context & Router Transkep (Code)': menuCtx },
    })[0].json;
    assert(menuReply.replyText.includes('/docker') && menuReply.replyText.includes('TRANSKEP AI ASSISTANT'));

    const resetCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: '/reset' }),
      staticData,
    })[0].json;
    assert.strictEqual(resetCtx.routeType, 'quick_reply');
    assert.strictEqual(resetCtx.quickAction, 'reset');
    assert.strictEqual(resetCtx.chatEpoch, 2);
    assert.strictEqual(resetCtx.sessionId, 'transkep_ai_session_e2');

    const afterResetCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ body: 'Halo lagi' }),
      staticData,
    })[0].json;
    assert.strictEqual(afterResetCtx.sessionId, 'transkep_ai_session_e2');
  }

  // Test G: Whitelist & Anti-Loop Guards
  {
    assert.strictEqual(
      runCodeNode(wf, 'Context & Router Transkep (Code)', {
        inputJson: makeWebhookEvent({ fromMe: true, body: '/docker' }),
      })[0].json.isAuthorized,
      false,
      `${label}: must reject fromMe: true`
    );
    assert.strictEqual(
      runCodeNode(wf, 'Context & Router Transkep (Code)', {
        inputJson: makeWebhookEvent({ from: `${botPhone}@c.us`, body: 'echo' }),
      })[0].json.isAuthorized,
      false,
      `${label}: must reject bot self number`
    );
    assert.strictEqual(
      runCodeNode(wf, 'Context & Router Transkep (Code)', {
        inputJson: makeWebhookEvent({ from: '123456@g.us', body: '/docker' }),
      })[0].json.isAuthorized,
      false,
      `${label}: must reject group chats`
    );
    assert.strictEqual(
      runCodeNode(wf, 'Context & Router Transkep (Code)', {
        inputJson: makeWebhookEvent({ event: 'message.ack', body: 'hi' }),
      })[0].json.isAuthorized,
      false,
      `${label}: must ignore non-message events (message.ack)`
    );
    assert.strictEqual(
      runCodeNode(wf, 'Context & Router Transkep (Code)', {
        inputJson: makeWebhookEvent({ from: '628111222333@c.us', notifyName: 'Orang Asing', body: '/docker' }),
      })[0].json.isAuthorized,
      false,
      `${label}: must reject unknown external sender`
    );
    const lidCtx = runCodeNode(wf, 'Context & Router Transkep (Code)', {
      inputJson: makeWebhookEvent({ from: '9988776655@lid', body: 'cek docker' }),
    })[0].json;
    assert.strictEqual(lidCtx.isAuthorized, true, `${label}: must allow private @lid sender`);
    assert.strictEqual(lidCtx.replyChatId, adminChatId, `${label}: @lid should reply to admin @c.us chatId`);
    assert(adminDigitsNoZero.length > 0);
  }
}

runBehaviorSuite(exampleWf, {
  adminChatId: '<GANTI_WA_ADMIN_CHAT_ID>',
  adminDigitsNoZero: '<GANTI_NO_WA_ADMIN_TANPA_NOL>',
  botPhone: '<GANTI_NO_WA_BOT>',
  label: 'example',
});

if (hasLive) {
  const stopTypingNode = liveWf.nodes.find((n) => n.name === 'Context & Router Transkep (Code)');
  const chatIdMatch = stopTypingNode.parameters.jsCode.match(/replyChatId\s*=\s*rawFrom\.endsWith\('@c\.us'\)\s*\?\s*rawFrom\s*:\s*'([^']+)'/);
  const noZeroMatch = stopTypingNode.parameters.jsCode.match(/rawJsonStr\.includes\('([^']+)'\)/);
  const botMatch = stopTypingNode.parameters.jsCode.match(/isBotSelf\s*=\s*rawFrom\.includes\('([^']+)'\)/);
  assert(chatIdMatch && noZeroMatch && botMatch, 'Could not extract live runtime IDs from Context & Router node');
  runBehaviorSuite(liveWf, {
    adminChatId: chatIdMatch[1],
    adminDigitsNoZero: noZeroMatch[1],
    botPhone: botMatch[1],
    label: 'live',
  });
}

console.log(`[PASS] Behavioral VM simulation passed for ${hasLive ? 'example + live local' : 'example CI'} Transkep AI Assistant workflows.`);

// =========================================================================
// 3. Validate Tahap 140 Workflow: Transkep AI Notulen Rapat (Audio -> JSON)
// =========================================================================
const notulenExPath = 'n8n/transkep-ai-notulen.example.json';
const notulenLivePath = 'n8n/transkep-ai-notulen.json';

assert(fs.existsSync(notulenExPath), `Missing ${notulenExPath}`);
const notulenExRaw = fs.readFileSync(notulenExPath, 'utf8');
const notulenExWf = JSON.parse(notulenExRaw);

function validateNotulenWorkflowTopology(wf, rawText, label) {
  assert.strictEqual(wf.name, 'Transkep AI Notulen Rapat', `${label}: workflow name must be 'Transkep AI Notulen Rapat'`);
  assert(!/zet+bot+/i.test(rawText), `${label}: must not contain zet+bot branding`);
  assert(!rawText.includes('.item.json'), `${label}: must avoid fragile .item.json references`);

  const byName = new Map();
  const byId = new Map();
  for (const n of wf.nodes) {
    assert(n.id && !byId.has(n.id), `${label}: duplicate/missing id on ${n.name}`);
    assert(n.name && !byName.has(n.name), `${label}: duplicate/missing name ${n.name}`);
    byId.set(n.id, n);
    byName.set(n.name, n);
    if (n.type === 'n8n-nodes-base.code') {
      new vm.Script(`(async function(){\n${n.parameters.jsCode}\n})()`, { filename: `${label}:${n.name}` });
    }
  }
  assert.strictEqual(wf.nodes.length, 52, `${label}: expected 52 nodes`);

  for (const [srcName, connGroups] of Object.entries(wf.connections || {})) {
    assert(byName.has(srcName), `${label}: missing connection source ${srcName}`);
    for (const branches of Object.values(connGroups)) {
      for (const branch of branches) {
        for (const edge of branch) {
          assert(byName.has(edge.node), `${label}: missing connection target ${edge.node}`);
        }
      }
    }
  }

  const webhookNode = byName.get('1. Webhook AI Notulen Rapat');
  assert(webhookNode && webhookNode.parameters.path === 'transkep-ai-notulen', `${label}: webhook path must be transkep-ai-notulen`);
  assert.strictEqual(webhookNode.parameters.responseMode, 'responseNode', `${label}: webhook must use responseNode`);

  const geminiHttp = byName.get('Panggil Gemini Multimodal API (HTTP)');
  assert(geminiHttp && String(geminiHttp.parameters.url).includes('models/gemini-3.8-flash:generateContent'), `${label}: sync HTTP node must invoke models/gemini-3.8-flash`);
  assert.strictEqual(geminiHttp.parameters.authentication, 'predefinedCredentialType', `${label}: Gemini HTTP node must use predefinedCredentialType`);
  assert.strictEqual(geminiHttp.parameters.nodeCredentialType, 'googlePalmApi', `${label}: Gemini HTTP node must bind googlePalmApi credential`);
  assert(geminiHttp.credentials && geminiHttp.credentials.googlePalmApi && geminiHttp.credentials.googlePalmApi.id, `${label}: Gemini HTTP node missing googlePalmApi credentials`);
  assert.strictEqual(geminiHttp.parameters.options.timeout, 180000, `${label}: sync HTTP timeout must be 180000 ms`);
  assert.strictEqual(geminiHttp.retryOnFail, true, `${label}: sync HTTP node must set retryOnFail: true`);
  assert.strictEqual(geminiHttp.continueOnFail, true, `${label}: Gemini HTTP node must set continueOnFail: true`);

  const fileUriHttp = byName.get('Panggil Gemini FileURI API (HTTP)');
  assert(
    fileUriHttp && String(fileUriHttp.parameters.url).includes('models/gemini-3.5-flash-lite:generateContent'),
    `${label}: Pass 1 FileURI HTTP node must use models/gemini-3.5-flash-lite:generateContent`
  );
  assert.strictEqual(fileUriHttp.parameters.options.timeout, 240000, `${label}: Pass 1 FileURI timeout must be 240000 ms`);

  const pass1ClipHttp = byName.get('Panggil Gemini Pass 1 Klip (HTTP)');
  assert(
    pass1ClipHttp && String(pass1ClipHttp.parameters.url).includes('primaryModelUrl'),
    `${label}: Pass 1 Klip HTTP node must bind $json.primaryModelUrl`
  );
  assert.strictEqual(pass1ClipHttp.parameters.options.timeout, 240000, `${label}: Pass 1 Klip timeout must be 240000 ms`);
  assert.strictEqual(pass1ClipHttp.parameters.options.batching.batch.batchSize, 1, `${label}: Pass 1 Klip must set batchSize: 1`);
  assert.strictEqual(pass1ClipHttp.parameters.options.batching.batch.batchInterval, 5000, `${label}: Pass 1 Klip must set batchInterval: 5000`);
  assert.strictEqual(pass1ClipHttp.continueOnFail, true);

  const failoverClipHttp = byName.get('Failover Klip ke Model Cadangan (HTTP)');
  assert(
    failoverClipHttp && String(failoverClipHttp.parameters.url).includes('failoverModelUrl'),
    `${label}: Failover Klip HTTP node must bind $json.failoverModelUrl`
  );
  assert.strictEqual(failoverClipHttp.parameters.options.timeout, 240000, `${label}: Failover Klip timeout must be 240000 ms`);
  assert.strictEqual(failoverClipHttp.parameters.options.batching.batch.batchSize, 1, `${label}: Failover Klip must set batchSize: 1`);
  assert.strictEqual(failoverClipHttp.parameters.options.batching.batch.batchInterval, 6000, `${label}: Failover Klip must set batchInterval: 6000`);
  assert.strictEqual(failoverClipHttp.continueOnFail, true);

  const pass2Http = byName.get('Panggil Gemini Pass 2 Editor Notulis (HTTP)');
  assert(
    pass2Http && String(pass2Http.parameters.url).includes('pass2ModelUrl') && String(pass2Http.parameters.url).includes('models/gemini-3.8-flash:generateContent'),
    `${label}: Pass 2 HTTP node must bind dynamic $json.pass2ModelUrl defaulting to models/gemini-3.8-flash`
  );
  assert.strictEqual(pass2Http.parameters.options.timeout, 240000, `${label}: Pass 2 timeout must be 240000 ms`);

  for (const sshName of ['SSH Buat Folder Audio', 'SSH FFmpeg Kompres & Potong 10 Menit', 'SSH Bersihkan Audio Sementara']) {
    const sshNode = byName.get(sshName);
    assert(sshNode && sshNode.type === 'n8n-nodes-base.ssh', `${label}: missing SSH node ${sshName}`);
    assert.strictEqual(sshNode.parameters.cwd, '={{ "" }}', `${label}: ${sshName} cwd must evaluate to empty string`);
    assert.strictEqual(sshNode.continueOnFail, true, `${label}: ${sshName} must set continueOnFail: true`);
    assert(sshNode.credentials && sshNode.credentials.sshPassword && sshNode.credentials.sshPassword.id, `${label}: ${sshName} missing sshPassword credentials`);
    assert(!String(sshNode.parameters.command).includes('"'), `${label}: ${sshName} command must avoid double quotes for Windows OpenSSH`);
  }
  const ffmpegSplitNode = byName.get('SSH FFmpeg Kompres & Potong 10 Menit');
  assert(String(ffmpegSplitNode.parameters.command).includes('-segment_time 600'), `${label}: FFmpeg command must segment into 600s (10-min) clips`);

  const writeDisk = byName.get('Simpan Audio ke Disk');
  assert(writeDisk && writeDisk.type === 'n8n-nodes-base.readWriteFile' && writeDisk.parameters.operation === 'write', `${label}: missing Simpan Audio ke Disk`);
  const readDisk = byName.get('Baca Klip MP3 dari Disk');
  assert(readDisk && readDisk.type === 'n8n-nodes-base.readWriteFile' && readDisk.parameters.operation === 'read', `${label}: missing Baca Klip MP3 dari Disk`);

  const ifNode = byName.get('Otorisasi Webhook Valid? (IF)');
  assert(ifNode && wf.connections['Otorisasi Webhook Valid? (IF)'].main.length === 2, `${label}: Auth IF node must have 2 branches`);

  for (const retryNodeName of [
    'Download Audio dari Google Drive',
    'Start Gemini Files Resumable Session (HTTP)',
    'Upload Binary ke Gemini Files API (HTTP)',
    'Kirim Hasil ke Callback GAS (HTTP)',
  ]) {
    const rn = byName.get(retryNodeName);
    assert(rn, `${label}: missing retry-hardened node ${retryNodeName}`);
    assert.strictEqual(rn.retryOnFail, true, `${label}: ${retryNodeName} must enable retryOnFail`);
    assert(rn.maxTries >= 3, `${label}: ${retryNodeName} must set maxTries >= 3`);
    assert(
      rn.waitBetweenTries > 0 && rn.waitBetweenTries <= 5000,
      `${label}: ${retryNodeName} waitBetweenTries must be within 1..5000 ms`
    );
    assert.strictEqual(rn.continueOnFail, true, `${label}: ${retryNodeName} must keep continueOnFail: true`);
  }

  const dlIf = byName.get('Download Drive Berhasil? (IF)');
  assert(dlIf && dlIf.type === 'n8n-nodes-base.if', `${label}: missing Download Drive Berhasil? (IF)`);
  assert.strictEqual(
    wf.connections['Siapkan Direktori Kerja Audio (Code)'].main[0][0].node,
    'Download Drive Berhasil? (IF)',
    `${label}: Siapkan Direktori Kerja Audio (Code) must connect to Download Drive Berhasil? (IF)`
  );
  const dlConns = wf.connections['Download Drive Berhasil? (IF)'].main;
  assert.strictEqual(dlConns.length, 2, `${label}: Download Drive Berhasil? (IF) must have 2 branches`);
  assert.strictEqual(dlConns[0][0].node, 'SSH Buat Folder Audio', `${label}: Download OK branch must route to SSH Buat Folder Audio`);
  assert.strictEqual(
    dlConns[1][0].node,
    'Siapkan Callback Error Upload (Code)',
    `${label}: Download failed branch must short-circuit to Siapkan Callback Error Upload (Code)`
  );
}

validateNotulenWorkflowTopology(notulenExWf, notulenExRaw, 'transkep-ai-notulen.example.json');
assert(!notulenExRaw.includes('YWZ8dADUWtnM4zyx'), 'Notulen example leaked SSH credential id');
for (const ph of ['<GANTI_TRANSKEP_WEBHOOK_KEY>', '<GANTI_GEMINI_CREDENTIAL_ID>', '<GANTI_SSH_CREDENTIAL_ID>', '<GANTI_N8N_INSTANCE_ID>', '<GANTI_WORKFLOW_ID>', '<GANTI_GAS_DEPLOYMENT_ID>', '<GANTI_GOOGLE_SERVICE_ACCOUNT_CREDENTIAL_ID>']) {
  assert(notulenExRaw.includes(ph), `Notulen example missing placeholder: ${ph}`);
}

const hasNotulenLive = fs.existsSync(notulenLivePath);
let notulenLiveWf = null;
if (hasNotulenLive) {
  const notulenLiveRaw = fs.readFileSync(notulenLivePath, 'utf8');
  assert(!/<GANTI_[A-Z0-9_]+>/.test(notulenLiveRaw), 'Live transkep-ai-notulen.json must not contain <GANTI_...> placeholders');
  notulenLiveWf = JSON.parse(notulenLiveRaw);
  validateNotulenWorkflowTopology(notulenLiveWf, notulenLiveRaw, 'transkep-ai-notulen.json');
  assert.strictEqual(notulenLiveWf.nodes.length, notulenExWf.nodes.length, 'Live & example Notulen workflows must have identical node count');
  assert.deepStrictEqual(notulenLiveWf.connections, notulenExWf.connections, 'Live & example Notulen workflow connections must be identical');
}

// VM simulations for Notulen workflow Code nodes (both example & live)
async function runNotulenBehaviorSuite(wf, expectedSecret, wfLabel) {
  const manualOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', { inputJson: {} })[0].json;
  assert.strictEqual(manualOut.isAuthorized, true, `${wfLabel}: Manual execution must be authorized`);
  assert.strictEqual(manualOut.isManualTest, true);
  assert.strictEqual(manualOut.geminiRequestBody.generationConfig.responseMimeType, 'application/json');
  assert.strictEqual(manualOut.geminiRequestBody.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.strictEqual(manualOut.geminiRequestBody.generationConfig.temperature, undefined);

  const unauthOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: { body: { secret_key: 'WRONG', id_rapat: 'RPT-1', agenda: 'Tes' } },
  })[0].json;
  assert.strictEqual(unauthOut.isAuthorized, false, `${wfLabel}: Wrong secret_key must fail authorization`);

  const authAudioOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        id_rapat: 'RPT-2026-140',
        agenda: 'Evaluasi Kinerja Bulanan',
        hari_tanggal: 'Rabu, 18 November 2026',
        tempat: 'Ruang Sidang Utama',
        pemimpin: 'Ketua',
        notulis: 'Dedi Sopiyan, S.H.',
        peserta_list: [{ nip: '197901012003011008', nama: 'Agus Salim, S.Ag.', jabatan: 'Sekretaris' }],
        transcript_text: 'Pembahasan sarana sidang.',
        audio_base64: 'data:audio/webm;base64,UklGRiQAAABXQVZF',
        audio_mime_type: 'audio/webm',
      },
    },
  })[0].json;
  assert.strictEqual(authAudioOut.isAuthorized, true, `${wfLabel}: Valid secret_key must pass authorization`);
  assert.strictEqual(authAudioOut.audioAttached, true);
  assert.strictEqual(authAudioOut.geminiRequestBody.contents[0].parts[0].inline_data.mime_type, 'audio/webm');
  assert.strictEqual(authAudioOut.geminiRequestBody.contents[0].parts[0].inline_data.data, 'UklGRiQAAABXQVZF');

  const parsedOut = runCodeNode(wf, 'Parse & Normalisasi JSON Notula (Code)', {
    inputJson: {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n' + JSON.stringify({
                  dasar_opsional: 'Surat Edaran Sekretaris MA',
                  pengarahan_umum: 'Pimpinan mengarahkan percepatan pelaporan.',
                  kesimpulan: 'Seluruh unit wajib lapor tepat waktu.',
                  transkrip_ringkas: 'Ketua membuka rapat lalu Sekretaris melaporkan progres.',
                  pembahasan: [
                    {
                      pembicara_nama: 'Agus Salim, S.Ag. (Sekretaris)',
                      pembicara_nip: '197901012003011008',
                      pembicara_jabatan: 'Sekretaris',
                      uraian: ['Laporan realisasi anggaran triwulan IV', 'Identifikasi kebutuhan ATK'],
                      tindak_lanjut: ['Susun revisi halaman III DIPA'],
                      target: 'Revisi DIPA selesai 100%',
                      penanggung_jawab: 'Kasubbag Keuangan',
                      tanggal_penyelesaian: '25 November 2026',
                    },
                  ],
                }) + '\n```',
              },
            ],
          },
        },
      ],
    },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': authAudioOut },
  })[0].json;

  assert.strictEqual(parsedOut.status, 'success');
  assert.strictEqual(parsedOut.id_rapat, 'RPT-2026-140');
  assert(parsedOut.data.pengarahan_umum.includes('percepatan pelaporan'));
  assert.strictEqual(parsedOut.data.pembahasan.length, 1);
  assert.strictEqual(parsedOut.data.pembahasan[0].uraian_text, '1. Laporan realisasi anggaran triwulan IV\n2. Identifikasi kebutuhan ATK');
  assert.strictEqual(parsedOut.data.pembahasan[0].target, 'Revisi DIPA selesai 100%');

  const errParsed = runCodeNode(wf, 'Parse & Normalisasi JSON Notula (Code)', {
    inputJson: { error: { message: 'Quota exceeded' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': authAudioOut },
  })[0].json;
  assert.strictEqual(errParsed.status, 'error');
  assert(errParsed.message.includes('Quota exceeded'));

  // Async Drive + Gemini Files API simulation
  const asyncDriveOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        event: 'AI_NOTULEN_RAPAT_ASYNC',
        async_mode: true,
        job_id: 'AINOT-TEST-99',
        callback_url: 'https://script.google.com/macros/s/MOCK/exec',
        id_rapat: 'RPT-2026-146',
        agenda: 'Rapat Panitera Pengganti',
        audio_drive_file_id: '1DriveAudio73MbFileId12345',
        audio_file_name: 'Rapat_PP.m4a',
        audio_mime_type: 'audio/x-m4a',
        audio_size_bytes: 77000000,
      },
    },
  })[0].json;
  assert.strictEqual(asyncDriveOut.isAuthorized, true);
  assert.strictEqual(asyncDriveOut.isAsyncDriveAudio, true);
  assert.strictEqual(asyncDriveOut.audioMimeType, 'audio/mp4');

  const upCheckOut = runCodeNode(wf, 'Cek Upload & Siapkan Gemini FileURI (Code)', {
    inputJson: {
      file: {
        name: 'files/gemini-audio-146',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/gemini-audio-146',
        state: 'ACTIVE',
        mimeType: 'audio/mp4',
      },
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': asyncDriveOut,
      'Start Gemini Files Resumable Session (HTTP)': { statusCode: 200, headers: { 'x-goog-upload-url': 'https://upload' } },
      'Download Audio dari Google Drive': { ok: true },
    },
  })[0].json;
  assert.strictEqual(upCheckOut.uploadOk, true);
  assert.strictEqual(upCheckOut.fileState, 'PROCESSING', `${wfLabel}: >10 MB audio must force initial PROCESSING wait cycle even when Files API responds ACTIVE`);

  const smallUpCheckOut = runCodeNode(wf, 'Cek Upload & Siapkan Gemini FileURI (Code)', {
    inputJson: {
      file: {
        name: 'files/gemini-audio-small',
        uri: 'https://generativelanguage.googleapis.com/v1beta/files/gemini-audio-small',
        state: 'ACTIVE',
        mimeType: 'audio/mp4',
      },
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': { ...asyncDriveOut, audioSizeBytes: 5000000 },
      'Start Gemini Files Resumable Session (HTTP)': { statusCode: 200, headers: { 'x-goog-upload-url': 'https://upload' } },
      'Download Audio dari Google Drive': { ok: true },
    },
  })[0].json;
  assert.strictEqual(smallUpCheckOut.fileState, 'ACTIVE', `${wfLabel}: <=10 MB audio stays ACTIVE immediately`);

  const payloadFileUriOut = runCodeNode(wf, 'Siapkan Payload Gemini FileURI (Code)', {
    inputJson: {
      ...upCheckOut,
      fileState: 'ACTIVE',
    },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': asyncDriveOut },
  })[0].json;
  assert.strictEqual(payloadFileUriOut.geminiRequestBody.contents[0].parts[0].file_data.file_uri, 'https://generativelanguage.googleapis.com/v1beta/files/gemini-audio-146');

  const cbAsyncOut = runCodeNode(wf, 'Parse & Siapkan Callback Async (Code)', {
    inputJson: {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              dasar_opsional: '',
              pengarahan_umum: 'Evaluasi kepaniteraan berjalan lancar.',
              kesimpulan: 'Selesai tepat waktu.',
              transkrip_ringkas: 'Ringkasan',
              pembahasan: [{
                pembicara_nama: 'Agus Salim, S.Ag.',
                uraian: ['Poin 1'],
                tindak_lanjut: ['Aksi 1'],
                target: '100%',
                penanggung_jawab: 'Panitera',
                tanggal_penyelesaian: 'Segera',
              }],
            }),
          }],
        },
      }],
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': asyncDriveOut,
      'Siapkan Payload Gemini FileURI (Code)': payloadFileUriOut,
    },
  })[0].json;
  assert.strictEqual(cbAsyncOut.callbackPayload.action, 'callbackAiNotulenJob');
  assert.strictEqual(cbAsyncOut.callbackPayload.job_id, 'AINOT-TEST-99');
  assert.strictEqual(cbAsyncOut.callbackPayload.status, 'success');
  assert.strictEqual(cbAsyncOut.geminiFileName, 'files/gemini-audio-146');

  // Tahap 147: FFmpeg 100MB gate + binary fallback + 2-Pass Smart Merge + SKB 2026-2027 Workday Calculator
  const big150MbOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        event: 'AI_NOTULEN_RAPAT_ASYNC',
        async_mode: true,
        job_id: 'AINOT-TEST-147',
        id_rapat: 'RPT-2026-147',
        agenda: 'Rapat Ruang Media Center',
        tgl_rapat_iso: '2026-03-17',
        ai_mode: 'merge',
        existing_draft: { pengarahan_umum: 'Draf awal', pembahasan: [{ pembicara_nama: 'Ketua', items: [{ uraian: 'Upload putusan' }] }] },
        audio_drive_file_id: '1DriveAudio150Mb',
        audio_file_name: 'Rapat_Panjang.m4a',
        audio_mime_type: 'audio/mp4',
        audio_size_bytes: 150000000,
      },
    },
  })[0].json;
  const small15MbOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        event: 'AI_NOTULEN_RAPAT_ASYNC',
        async_mode: true,
        job_id: 'AINOT-TEST-15M',
        id_rapat: 'RPT-2026-15M',
        audio_drive_file_id: '1DriveAudio15Mb',
        audio_file_name: 'Rapat_Singkat.m4a',
        audio_mime_type: 'audio/mp4',
        audio_size_bytes: 15000000,
      },
    },
  })[0].json;
  const wav30MbOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        event: 'AI_NOTULEN_RAPAT_ASYNC',
        async_mode: true,
        job_id: 'AINOT-TEST-30WAV',
        id_rapat: 'RPT-2026-WAV',
        audio_drive_file_id: '1DriveAudio30MbWav',
        audio_file_name: 'Rapat.wav',
        audio_mime_type: 'audio/wav',
        audio_size_bytes: 30000000,
      },
    },
  })[0].json;
  assert.strictEqual(big150MbOut.needsFfmpeg, true, `${wfLabel}: >100 MB compressed audio must trigger needsFfmpeg: true`);
  assert.strictEqual(asyncDriveOut.needsFfmpeg, false, `${wfLabel}: 77 MB .m4a (<=100 MB) must skip redundant FFmpeg re-encode`);
  assert.strictEqual(wav30MbOut.needsFfmpeg, true, `${wfLabel}: uncompressed WAV >20 MB must trigger needsFfmpeg: true`);
  assert.strictEqual(small15MbOut.needsFfmpeg, false, `${wfLabel}: <=20 MB audio (15 MB) must bypass FFmpeg`);
  assert.strictEqual(big150MbOut.tgl_rapat_iso, '2026-03-17');

  const ffmpegSepOk = runCodeNode(wf, 'Evaluasi Hasil FFmpeg & Siapkan Binary (Code)', {
    inputJson: {},
    inputBinary: { data: { id: 'fs-bin-147', mimeType: 'audio/mpeg' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
  })[0];
  assert.strictEqual(ffmpegSepOk.json.ffmpegUsed, true, `${wfLabel}: binaryMode separate (.id) must count as valid FFmpeg binary`);

  const ffmpegOk = runCodeNode(wf, 'Evaluasi Hasil FFmpeg & Siapkan Binary (Code)', {
    inputJson: {},
    inputBinary: { data: { data: 'bXAzaGVhZA==', mimeType: 'audio/mpeg' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
  })[0];
  assert.strictEqual(ffmpegOk.json.ffmpegUsed, true);
  assert.strictEqual(ffmpegOk.json.finalMimeType, 'audio/mpeg');
  assert.strictEqual(ffmpegOk.binary.data.data, 'bXAzaGVhZA==');

  const ffmpegFallback = runCodeNode(wf, 'Evaluasi Hasil FFmpeg & Siapkan Binary (Code)', {
    inputJson: { error: { message: 'FFmpeg offline' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
    nodeBinaryMap: { 'Download Audio dari Google Drive': { data: { data: 'origDriveBin', mimeType: 'audio/mp4' } } },
  })[0];
  assert.strictEqual(ffmpegFallback.json.ffmpegUsed, false);
  assert.strictEqual(ffmpegFallback.json.ffmpegFallback, true);
  assert.strictEqual(ffmpegFallback.binary.data.data, 'origDriveBin');

  const mergedUpload = runCodeNode(wf, 'Gabungkan Sesi Upload & Binary (Code)', {
    inputJson: { statusCode: 200, headers: { 'X-Goog-Upload-URL': 'https://upload.gemini/resumable/xyz' } },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Evaluasi Hasil FFmpeg & Siapkan Binary (Code)': ffmpegOk.json,
    },
    nodeBinaryMap: {
      'Evaluasi Hasil FFmpeg & Siapkan Binary (Code)': ffmpegOk.binary,
    },
  })[0];
  assert.strictEqual(mergedUpload.json.uploadUrl, 'https://upload.gemini/resumable/xyz');
  assert.strictEqual(mergedUpload.binary.data.data, 'bXAzaGVhZA==');

  const pass2PrepOut = runCodeNode(wf, 'Siapkan Payload Pass 2 Smart Merge (Code)', {
    inputJson: {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ pembicara_terdeteksi: [{ badge: 'Badge 1', nama_kandidat: 'Ketua' }] }) }] } }],
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Gemini FileURI (Code)': { fileName: 'files/gem-147', fileUri: 'https://gemini/gem-147', pollFailedMessage: '' },
    },
  })[0].json;
  assert(pass2PrepOut.geminiPass2RequestBody.contents[0].parts[0].text.includes('Draf awal'), `${wfLabel}: Pass 2 prompt must include Tab 3 draft`);

  const cb147Out = runCodeNode(wf, 'Parse & Siapkan Callback Async (Code)', {
    inputJson: {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              pengarahan_umum: 'Arahan lengkap.',
              kesimpulan: 'Segera dilaksanakan.',
              pembahasan: [{
                pembicara_nama: 'Pembicara #2 (Belum Teridentifikasi — Bidang Media)',
                pembicara_nip: '9999',
                items: [
                  {
                    uraian: 'Upload putusan tepat waktu',
                    tindak_lanjut: 'Laksanakan sesuai SOP',
                    target_kategori_waktu: 'HARI_RAPAT',
                    target_tanggal_eksplisit: '',
                    penanggung_jawab: 'Panitera Muda',
                    selesai_kategori_waktu: 'HARI_RAPAT',
                    selesai_tanggal_eksplisit: '',
                  },
                  {
                    uraian: 'Siapkan ruang Media Center',
                    tindak_lanjut: 'Koordinasi tim sarpras & IT',
                    target_kategori_waktu: 'JANGKA_PENDEK',
                    target_tanggal_eksplisit: '',
                    penanggung_jawab: 'Sekretaris',
                    selesai_kategori_waktu: 'PROYEK_SARANA',
                    selesai_tanggal_eksplisit: '',
                  },
                ],
              }],
            }),
          }],
        },
      }],
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Pass 2 Smart Merge (Code)': pass2PrepOut,
    },
  })[0].json;
  assert.strictEqual(cb147Out.callbackPayload.data.pembahasan[0].pembicara_nip, '', `${wfLabel}: uncertain speaker must not carry NIP`);
  assert.strictEqual(cb147Out.callbackPayload.data.pembahasan[0].items[0].target, '2026-03-17', `${wfLabel}: HARI_RAPAT must stay on meeting date`);
  assert.strictEqual(cb147Out.callbackPayload.data.pembahasan[0].items[1].target, '2026-03-31', `${wfLabel}: 2026-03-17 + 5 workdays must skip Lebaran 2026 SKB`);
  assert.strictEqual(cb147Out.callbackPayload.data.pembahasan[0].items[1].tanggal_penyelesaian, '2026-04-15', `${wfLabel}: 2026-03-17 + 15 workdays must skip Lebaran & Wafat Yesus Kristus SKB`);

  // Self-Healing Hotfix v3.8.82: Multi-part thinking output + Pass 1/2 mutual recovery
  const thinkingPass2 = runCodeNode(wf, 'Parse & Siapkan Callback Async (Code)', {
    inputJson: {
      candidates: [{
        content: {
          parts: [
            { thought: true, text: 'Menganalisis pembicara rapat...' },
            { text: '{"pengarahan_umum":"Arahan Thinking OK","kesimpulan":"Mantap","pembahasan":[]}' },
          ],
        },
      }],
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Pass 2 Smart Merge (Code)': pass2PrepOut,
    },
  })[0].json;
  assert.strictEqual(thinkingPass2.callbackPayload.status, 'success');
  assert.strictEqual(thinkingPass2.callbackPayload.data.pengarahan_umum, 'Arahan Thinking OK');

  const pass1FailPrep = runCodeNode(wf, 'Siapkan Payload Pass 2 Smart Merge (Code)', {
    inputJson: { error: { message: '503 Service Unavailable' } },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Gemini FileURI (Code)': {
        fileName: 'files/gem-rec',
        fileUri: 'https://gemini/gem-rec',
        fileMime: 'audio/mpeg',
        pollFailedMessage: '',
      },
    },
  })[0].json;
  assert.strictEqual(pass1FailPrep.pass1FailedMessage, '', `${wfLabel}: Pass 1 failure must allow Pass 2 audio fallback instead of aborting`);
  assert.strictEqual(pass1FailPrep.useAudioFallbackInPass2, true);
  assert.strictEqual(pass1FailPrep.pass2ModelName, 'models/gemini-3.8-flash', `${wfLabel}: Pass 2 failover must switch to cross-model gemini-3.8-flash`);
  assert.strictEqual(
    pass1FailPrep.pass2ModelUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    `${wfLabel}: Pass 2 failover URL must target gemini-3.8-flash`
  );
  assert.strictEqual(pass1FailPrep.geminiPass2RequestBody.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.strictEqual(pass1FailPrep.geminiPass2RequestBody.generationConfig.temperature, undefined);
  assert.strictEqual(pass1FailPrep.geminiPass2RequestBody.contents[0].parts[0].file_data.file_uri, 'https://gemini/gem-rec');

  const pass1OkPrep = runCodeNode(wf, 'Siapkan Payload Pass 2 Smart Merge (Code)', {
    inputJson: {
      candidates: [{ content: { parts: [{ text: JSON.stringify({ pengarahan_umum: 'Dari Pass 1', kesimpulan: 'OK', pembahasan: [] }) }] } }],
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Gemini FileURI (Code)': { fileName: 'files/gem-147', fileUri: 'https://gemini/gem-147', pollFailedMessage: '' },
    },
  })[0].json;
  assert.strictEqual(pass1OkPrep.pass2ModelName, 'models/gemini-3.8-flash', `${wfLabel}: Normal Pass 2 Smart Merge must use gemini-3.8-flash`);
  assert.strictEqual(
    pass1OkPrep.pass2ModelUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
  );
  const salvagedPass1Cb = runCodeNode(wf, 'Parse & Siapkan Callback Async (Code)', {
    inputJson: { error: { message: '503 Model Overloaded' } },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Pass 2 Smart Merge (Code)': pass1OkPrep,
    },
  })[0].json;
  assert.strictEqual(salvagedPass1Cb.callbackPayload.status, 'success', `${wfLabel}: Pass 2 failure must salvage Pass 1 Notula JSON`);
  assert.strictEqual(salvagedPass1Cb.callbackPayload.data.pengarahan_umum, 'Dari Pass 1');

  const sseCb = runCodeNode(wf, 'Parse & Siapkan Callback Async (Code)', {
    inputJson: {
      data: [
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'Berpikir...' }] } }] }),
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"pengarahan_umum":"Dari SSE ' }] } }] }),
        'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Stream","kesimpulan":"Mantap","pembahasan":[]}' }] } }] }),
        'data: [DONE]'
      ].join('\n'),
    },
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Payload Pass 2 Smart Merge (Code)': pass1OkPrep,
    },
  })[0].json;
  assert.strictEqual(sseCb.callbackPayload.status, 'success', `${wfLabel}: SSE data: stream chunks must parse cleanly`);
  assert.strictEqual(sseCb.callbackPayload.data.pengarahan_umum, 'Dari SSE Stream');

  // Notebook PRO text-only fast sync mode (Tahap 148)
  const notebookSyncOut = runCodeNode(wf, 'Validasi & Siapkan Prompt Notulen (Code)', {
    inputJson: {
      body: {
        secret_key: expectedSecret,
        id_rapat: 'RPT-NB-148',
        agenda: 'Bedah Berkas Perkara Peradilan Agama',
        transcript_text: 'Ketua PTA Bandung: Uji Yuridis, Filosofis, Sosiologis 64 65.',
      },
    },
  })[0].json;
  assert.strictEqual(notebookSyncOut.isAuthorized, true);
  assert.strictEqual(notebookSyncOut.isAsyncDriveAudio, false, `${wfLabel}: Notebook text mode must use sync path`);
  assert(
    notebookSyncOut.cleanPrompt.includes('=== HASIL RINGKASAN / TRANSKRIP RAPAT (MIS. GEMINI NOTEBOOK) ==='),
    `${wfLabel}: Notebook text prompt must label pasted Notebook summary clearly`
  );
  assert(
    notebookSyncOut.fullSystemPrompt.includes('BERSIHKAN SITASI TEMPELAN'),
    `${wfLabel}: System prompt must strip pasted Notebook citation numbers`
  );

  // Opsi B Pipeline: Sanitization, binary re-attach, 10m split Free-Tier Round-Robin, failover splice & cleanup
  const maliciousCtx = { ...big150MbOut, job_id: '../../etc; rm -rf /', audioFileName: 'Rapat.m4a;evil' };
  const dirSetupOut = runCodeNode(wf, 'Siapkan Direktori Kerja Audio (Code)', {
    inputJson: {},
    inputBinary: { data: { id: 'fs-dl-1', fileName: 'Rapat.m4a', mimeType: 'audio/mp4' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': maliciousCtx },
  })[0];
  assert(!/[./;\s]/.test(dirSetupOut.json.safeJobId), `${wfLabel}: safeJobId must strip traversal/shell chars`);
  assert.strictEqual(dirSetupOut.json.safeExt, 'm4a');
  assert.strictEqual(dirSetupOut.json.hasBin, true);
  assert(dirSetupOut.json.n8nInputPath.startsWith('/home/node/.n8n-files/'), `${wfLabel}: must stay inside n8n 2.x default ~/.n8n-files sandbox`);
  assert(dirSetupOut.json.ffmpegOutputPattern.startsWith('/audio-tmp/'));

  const reattachOk = runCodeNode(wf, 'Re-Attach Binary Untuk Simpan Disk (Code)', {
    inputJson: { code: 0, stdout: '', stderr: '' },
    nodeMap: { 'Siapkan Direktori Kerja Audio (Code)': dirSetupOut.json },
    nodeBinaryMap: { 'Download Audio dari Google Drive': { data: { id: 'fs-dl-1', mimeType: 'audio/mp4' } } },
  })[0];
  assert.strictEqual(reattachOk.json.diskReady, true);
  assert.strictEqual(reattachOk.binary.data.id, 'fs-dl-1');

  const reattachSshFail = runCodeNode(wf, 'Re-Attach Binary Untuk Simpan Disk (Code)', {
    inputJson: { error: { message: 'SSH offline' } },
    nodeMap: { 'Siapkan Direktori Kerja Audio (Code)': dirSetupOut.json },
    nodeBinaryMap: { 'Download Audio dari Google Drive': { data: { id: 'fs-dl-1', mimeType: 'audio/mp4' } } },
  })[0];
  assert.strictEqual(reattachSshFail.json.diskReady, false);

  // Zero-chunk fallback must recover Drive binary and keep chunksAvailable: false
  const zeroChunkFallback = await runCodeNodeAsync(wf, 'Siapkan Payload Klip Round-Robin (Code)', {
    inputAll: [{ json: {} }],
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Direktori Kerja Audio (Code)': dirSetupOut.json,
    },
    nodeBinaryMap: { 'Download Audio dari Google Drive': { data: { id: 'orig-drv', mimeType: 'audio/mp4' } } },
  });
  assert.strictEqual(zeroChunkFallback[0].json.chunksAvailable, false);
  assert.strictEqual(zeroChunkFallback[0].binary.data.id, 'orig-drv');

  // Out-of-order 4 binaryMode:separate chunks resolved via getBinaryDataBuffer -> sorted & 10m Free-Tier Round-Robin assigned
  const unsortedChunks = [
    { json: {}, binary: { data: { id: 'bin-2', fileName: 'part_002.mp3', mimeType: 'audio/mpeg', _buffer: Buffer.from('SEG2') } } },
    { json: {}, binary: { data: { id: 'bin-0', fileName: 'part_000.mp3', mimeType: 'audio/mpeg', _buffer: Buffer.from('SEG0') } } },
    { json: {}, binary: { data: { id: 'bin-3', fileName: 'part_003.mp3', mimeType: 'audio/mpeg', _buffer: Buffer.from('SEG3') } } },
    { json: {}, binary: { data: { id: 'bin-1', fileName: 'part_001.mp3', mimeType: 'audio/mpeg', _buffer: Buffer.from('SEG1') } } },
  ];
  const clipPayloads = await runCodeNodeAsync(wf, 'Siapkan Payload Klip Round-Robin (Code)', {
    inputAll: unsortedChunks,
    nodeMap: {
      'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut,
      'Siapkan Direktori Kerja Audio (Code)': dirSetupOut.json,
    },
  });
  assert.strictEqual(clipPayloads.length, 4, `${wfLabel}: expected 4 chunk payloads`);
  assert.deepStrictEqual(
    Array.from(clipPayloads, (c) => c.json.fileName),
    ['part_000.mp3', 'part_001.mp3', 'part_002.mp3', 'part_003.mp3'],
    `${wfLabel}: chunks must be sorted chronologically`
  );
  assert(clipPayloads[1].json.timeWindowLabel.includes('00:10–00:20'), `${wfLabel}: chunks must reflect 10-minute step windows`);
  assert.strictEqual(clipPayloads[0].json.primaryModelName, 'models/gemini-3.5-flash-lite');
  assert.strictEqual(clipPayloads[1].json.primaryModelName, 'models/gemini-3.8-flash');
  assert.strictEqual(clipPayloads[2].json.primaryModelName, 'models/gemini-3.5-flash-lite');
  assert.strictEqual(clipPayloads[3].json.primaryModelName, 'models/gemini-3.8-flash');
  assert.strictEqual(
    Buffer.from(clipPayloads[1].json.chunkGeminiRequestBody.contents[0].parts[0].inline_data.data, 'base64').toString('utf8'),
    'SEG1',
    `${wfLabel}: getBinaryDataBuffer index must map to unsorted origIdx before sorting`
  );
  assert.strictEqual(clipPayloads[0].json.chunkGeminiRequestBody.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.strictEqual(clipPayloads[0].json.chunkGeminiRequestBody.generationConfig.maxOutputTokens, 32768);
  assert.strictEqual(clipPayloads[0].json.chunkGeminiRequestBody.generationConfig.temperature, undefined);

  // Evaluate 4 clips: Case A (all succeed, strictNodes: true without failover nodes)
  const makeGeminiOk = (speakerName, uraianText) => ({
    json: {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              pengarahan_umum: 'Arahan rapat',
              kesimpulan: 'Laksanakan',
              transkrip_ringkas: speakerName + ' berbicara.',
              pembahasan: [{ pembicara_nama: speakerName, items: [{ uraian: uraianText, tindak_lanjut: 'Tindak', target_kategori_waktu: 'JANGKA_PENDEK', penanggung_jawab: 'Panitera', selesai_kategori_waktu: 'JANGKA_PENDEK' }] }],
            }),
          }],
        },
      }],
    },
  });

  const evalAllOk = runCodeNode(wf, 'Evaluasi Hasil Klip & Cek Failover (Code)', {
    inputAll: [
      makeGeminiOk('Pembicara A', 'Bahasan 1'),
      makeGeminiOk('Pembicara B', 'Bahasan 2'),
      makeGeminiOk('Pembicara C', 'Bahasan 3'),
      makeGeminiOk('Pembicara D', 'Bahasan 4'),
    ],
    nodeAllMap: { 'Siapkan Payload Klip Round-Robin (Code)': clipPayloads },
  })[0].json;
  assert.strictEqual(evalAllOk.hasFailedClips, false);
  const mergedAllOk = runCodeNode(wf, 'Gabungkan Semua Klip Untuk Pass 2 (Code)', {
    inputAll: [{ json: evalAllOk }],
    nodeMap: { 'Evaluasi Hasil Klip & Cek Failover (Code)': evalAllOk },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(mergedAllOk.fromChunkPipeline, true);
  assert.strictEqual(mergedAllOk.chunkSalvagedObj.pembahasan.length, 4, `${wfLabel}: must preserve all 4 speakers across chunks`);
  assert.strictEqual(mergedAllOk.chunkSoftError, '');

  // Evaluate 4 clips: Case B (Clip #1 fails 503 on 3.8-flash -> Failover on 3.5-flash-lite recovers chronologically!)
  const evalWithFail = runCodeNode(wf, 'Evaluasi Hasil Klip & Cek Failover (Code)', {
    inputAll: [
      makeGeminiOk('Pembicara A', 'Bahasan 1'),
      { json: { error: { message: '503 High Demand' } } },
      makeGeminiOk('Pembicara C', 'Bahasan 3'),
      makeGeminiOk('Pembicara D', 'Bahasan 4'),
    ],
    nodeAllMap: { 'Siapkan Payload Klip Round-Robin (Code)': clipPayloads },
  })[0].json;
  assert.strictEqual(evalWithFail.hasFailedClips, true);
  assert.strictEqual(evalWithFail.failedClips.length, 1);

  const splitFailItems = runCodeNode(wf, 'Pecah Klip Gagal Untuk Failover (Code)', {
    inputJson: evalWithFail,
  });
  assert.strictEqual(splitFailItems.length, 1);
  assert.strictEqual(splitFailItems[0].json.failoverModelName, 'models/gemini-3.5-flash-lite');

  const mergedRecovered = runCodeNode(wf, 'Gabungkan Semua Klip Untuk Pass 2 (Code)', {
    inputAll: [makeGeminiOk('Pembicara B Pulih', 'Bahasan 2 Pulih')],
    nodeMap: { 'Evaluasi Hasil Klip & Cek Failover (Code)': evalWithFail },
    nodeAllMap: { 'Pecah Klip Gagal Untuk Failover (Code)': splitFailItems },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(mergedRecovered.chunkStats.okCount, 4);
  assert.deepStrictEqual(
    Array.from(mergedRecovered.chunkSalvagedObj.pembahasan, (p) => p.pembicara_nama),
    ['Pembicara A', 'Pembicara B Pulih', 'Pembicara C', 'Pembicara D'],
    `${wfLabel}: failover clip must splice back in strict chronological order`
  );

  // Pass 2 Smart Merge directly from Opsi B chunk pipeline (strictNodes: true, no Files API nodes executed!)
  const pass2FromChunks = runCodeNode(wf, 'Siapkan Payload Pass 2 Smart Merge (Code)', {
    inputJson: mergedRecovered,
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(pass2FromChunks.fromChunkPipeline, true);
  assert.strictEqual(pass2FromChunks.useAudioFallbackInPass2, false);
  assert.strictEqual(pass2FromChunks.pass2ModelName, 'models/gemini-3.8-flash');
  assert(pass2FromChunks.geminiPass2RequestBody.contents[0].parts[0].text.includes('SEGMEN 2/4'));
  assert.strictEqual(pass2FromChunks.geminiPass2RequestBody.generationConfig.thinkingConfig.thinkingLevel, 'low');

  // Cleanup node safety with strictNodes: true across both paths
  const cleanupDiskOnly = runCodeNode(wf, 'Cek Kebutuhan Cleanup (Code)', {
    inputJson: {},
    nodeMap: {
      'Siapkan Direktori Kerja Audio (Code)': dirSetupOut.json,
      'Re-Attach Binary Untuk Simpan Disk (Code)': { sshOk: true },
    },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(cleanupDiskOnly.hasTempDisk, true);
  assert.strictEqual(cleanupDiskOnly.hasGeminiFile, false);

  const cleanupFilesFallback = runCodeNode(wf, 'Cek Kebutuhan Cleanup (Code)', {
    inputJson: {},
    nodeMap: {
      'Cek Upload & Siapkan Gemini FileURI (Code)': { fileName: 'files/gem-clean-1' },
    },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(cleanupFilesFallback.hasTempDisk, false);
  assert.strictEqual(cleanupFilesFallback.hasGeminiFile, true);
  assert.strictEqual(cleanupFilesFallback.geminiFileName, 'files/gem-clean-1');

  // Drive download stream abort short-circuit (Tahap 147D)
  const dlAbortDirOut = runCodeNode(wf, 'Siapkan Direktori Kerja Audio (Code)', {
    inputJson: { error: { message: 'stream has been aborted' } },
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
  })[0].json;
  assert.strictEqual(dlAbortDirOut.hasBin, false, `${wfLabel}: Drive error must produce hasBin: false`);
  assert(
    dlAbortDirOut.errorMessage.includes('stream has been aborted'),
    `${wfLabel}: Drive error must propagate errorMessage for short-circuit callback`
  );

  const dlAbortCbOut = runCodeNode(wf, 'Siapkan Callback Error Upload (Code)', {
    inputJson: dlAbortDirOut,
    nodeMap: { 'Validasi & Siapkan Prompt Notulen (Code)': big150MbOut },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(dlAbortCbOut.callbackPayload.status, 'error');
  assert(dlAbortCbOut.callbackPayload.message.includes('stream has been aborted'));

  const cleanupAfterAbort = runCodeNode(wf, 'Cek Kebutuhan Cleanup (Code)', {
    inputJson: {},
    nodeMap: { 'Siapkan Direktori Kerja Audio (Code)': dlAbortDirOut },
    strictNodes: true,
  })[0].json;
  assert.strictEqual(cleanupAfterAbort.hasTempDisk, false, `${wfLabel}: short-circuited Drive abort must skip SSH disk cleanup`);
  assert.strictEqual(cleanupAfterAbort.hasGeminiFile, false, `${wfLabel}: short-circuited Drive abort must have no Gemini file to delete`);
}

(async () => {
  await runNotulenBehaviorSuite(notulenExWf, '<GANTI_TRANSKEP_WEBHOOK_KEY>', 'notulen-example');
  if (hasNotulenLive) {
    const prepNode = notulenLiveWf.nodes.find((n) => n.name === 'Validasi & Siapkan Prompt Notulen (Code)');
    const secretMatch = prepNode.parameters.jsCode.match(/expectedSecret\s*=\s*'([^']+)'/);
    assert(secretMatch && secretMatch[1], 'Live transkep-ai-notulen.json missing expectedSecret');
    await runNotulenBehaviorSuite(notulenLiveWf, secretMatch[1], 'notulen-live');
  }
  console.log(`[PASS] Transkep AI Notulen Rapat workflow topology, multimodal Gemini payload & JSON normalizer verified (${hasNotulenLive ? 'example + live local' : 'example CI'}).`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
