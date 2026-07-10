// 状态锁与记录
const fixingTabs = new Set();
const fixedDomains = new Set();

// 生成 Rule ID (DNR 要求 ID 必须是正整数)
function generateRuleId(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash << 5) - hash + domain.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 50000) + 1000;
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

// 检测并修复 HTTP 响应头中的不兼容的 CSP
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId < 0) return;

    const url = new URL(details.url);
    const domain = url.hostname;

    let hasIncompatibleCSPHeader = false;

    for (let header of details.responseHeaders || []) {
      if (name === "content-security-policy") {
        if (header.value.toLowerCase().includes("strict-dynamic")) {
          hasIncompatibleCSPHeader = true;
        }
      }
    }

    if (hasIncompatibleCSPHeader && !fixedDomains.has(domain)) {
      console.log(`发现不兼容的 CSP (${domain})`);
      fixedDomains.add(domain);

      const ruleId = generateRuleId(domain);

      chrome.declarativeNetRequest
        .updateSessionRules({
          removeRuleIds: [ruleId],
          addRules: [
            {
              id: ruleId,
              priority: 1,
              action: {
                type: "modifyHeaders",
                responseHeaders: [
                  {
                    header: "content-security-policy",
                    operation: "remove",
                  },
                ],
              },
              condition: {
                urlFilter: `||${domain}`,
                resourceTypes: ["main_frame", "sub_frame", "script", "xmlhttprequest", "websocket", "other"],
              },
            },
          ],
        })
        .then(() => {
          if (details.type === "main_frame") {
            console.log(`已删除不兼容的CSP，正在刷新 Tab ${tabId} 避开缓存...`);
            chrome.tabs.update(tabId, { url: details.url });
          } else {
            // console.log(`子资源触发，规则已静默生效，不刷新页面。`);
          }
        })
        .catch((err) => console.error("无法删除不兼容的CSP，msg:", err));

      return;
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);
