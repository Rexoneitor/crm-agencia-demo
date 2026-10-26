import type { Metadata, Viewport } from "next";
import { BRAND } from "@/config/brand";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: BRAND.appTitle, template: `%s · ${BRAND.short}` },
  description: `${BRAND.name}: contratos, reservas, pagos y cupos de la agencia.`,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a2547" },
    { media: "(prefers-color-scheme: dark)", color: "#061a33" },
  ],
};

/**
 * Algunas extensiones del navegador (antivirus como Bitdefender, Grammarly,
 * etc.) inyectan atributos en el HTML ANTES de que React se cargue, lo que
 * provoca un falso "hydration error". Este script los limpia justo antes de
 * la hidratación. No afecta a la seguridad del equipo.
 */
const CLEANUP_EXTENSION_ATTRS = `(function(){try{
  var pref=["bis_skin_checked","bis_register","__processed","data-new-gr-c-s","data-gr-","data-lt-","cz-shortcut-listen","data-darkreader","monica-"];
  var match=function(n){for(var j=0;j<pref.length;j++)if(n===pref[j]||n.indexOf(pref[j])===0)return true;return false;};
  var strip=function(el){if(!el||!el.attributes)return;for(var i=el.attributes.length-1;i>=0;i--){if(match(el.attributes[i].name))el.removeAttribute(el.attributes[i].name);}};
  var walk=function(root){strip(root);if(root.querySelectorAll){var all=root.querySelectorAll("*");for(var k=0;k<all.length;k++)strip(all[k]);}};
  walk(document.documentElement);
  var obs=new MutationObserver(function(muts){for(var m=0;m<muts.length;m++){var mm=muts[m];if(mm.type==="attributes"&&match(mm.attributeName))mm.target.removeAttribute(mm.attributeName);if(mm.addedNodes)for(var a=0;a<mm.addedNodes.length;a++)if(mm.addedNodes[a].nodeType===1)walk(mm.addedNodes[a]);}});
  obs.observe(document.documentElement,{attributes:true,subtree:true,childList:true});
  var t0=Date.now();(function loop(){walk(document.documentElement);if(Date.now()-t0<8000)requestAnimationFrame(loop);else obs.disconnect();})();
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CLEANUP_EXTENSION_ATTRS }} />
      </head>
      <body className="font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
