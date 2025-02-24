import { $fetch } from "ohmyfetch";
import ora from "ora";
import type { Plugin } from "vite";
import type { ResolvedConfig } from "../../types";

async function replaceAsync(str, regex, asyncFn) {
  const promises = [];
  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}
export default function ({ bridge }: ResolvedConfig): Plugin {
  const reqCache: Map<string, string> = new Map();
  return {
    name: "vite-tinypages-ssrFetch",
    enforce: "pre",
    async transform(code: string, id: string, options) {
      if (!id.endsWith(".jsx") && !id.endsWith(".tsx")) return;
      //Simply inject the pageCtx in ssr since in client it will be available globally
      if (options.ssr) {
        code = `const pageCtx=${JSON.stringify(bridge.pageCtx)}; \n` + code;
      }
      return await replaceAsync(
        code,
        /\$\$fetch\([\"\`\'][\s\S]*[\"\`\']\)/g,
        async (payload: string) => {
          let payloadFetch;
          const url = payload.slice(9, -2);
          const spinner = ora(`Loading ${url}`);
          spinner.color = "yellow";
          const fetchNReturn = async () => {
            spinner.start();
            const value = await $fetch(url);
            spinner.succeed(`Successfully fetched ${url}!`);
            return value;
          };
          try {
            if (options.ssr) {
              payloadFetch = JSON.stringify(
                reqCache.get(url) || (await fetchNReturn())
              );
              reqCache.set(url, payloadFetch);
            } else {
              payloadFetch = reqCache.get(url);
            }
            return payloadFetch;
          } catch (e) {
            spinner.fail(`${e.stack}`);
            return payload;
          }
        }
      );
    },
  };
}
