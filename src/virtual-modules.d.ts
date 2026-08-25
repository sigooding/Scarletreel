declare const __SCARLET_REEL_BUILD_ID__: string;

/* Type the build-time virtual module injected by the `builtin-images` Vite
 * plugin in vite.config.ts — the full list of image files under public/img. */
declare module "virtual:builtin-images" {
  export interface BuiltinImage {
    /** stable public path, e.g. "/img/bg-office.jpg" */
    url: string;
    /** human-readable label derived from the file name */
    label: string;
  }
  const images: BuiltinImage[];
  export default images;
}
