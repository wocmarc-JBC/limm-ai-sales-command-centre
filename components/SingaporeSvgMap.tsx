// Local Singapore outline layer, simplified from public-domain Singapore outline references.
// It intentionally renders only the mainland and Sentosa for the v6.4.4 dashboard map.
export function SingaporeSvgMap() {
  return (
    <svg
      aria-hidden="true"
      className="accurate-singapore-map singapore-map-svg singapore-silhouette-map absolute inset-x-1 top-2 h-[82%] w-[calc(100%-0.5rem)] opacity-95 md:inset-x-4 md:w-[calc(100%-2rem)]"
      data-testid="singapore-silhouette-map"
      viewBox="0 0 900 520"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="sg-mainland-fill" x1="55" x2="870" y1="178" y2="342" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#132a3d" />
          <stop offset="0.5" stopColor="#0b1727" />
          <stop offset="1" stopColor="#211d12" />
        </linearGradient>
        <linearGradient id="sg-sentosa-fill" x1="364" x2="488" y1="376" y2="404" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b1f2e" />
          <stop offset="1" stopColor="#162532" />
        </linearGradient>
        <filter id="sg-mainland-soft-glow" x="-16%" y="-28%" width="132%" height="156%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        className="singapore-mainland singapore-island-silhouette"
        d="M58 313 L78 286 L103 274 L127 249 L161 236 L204 221 L246 226 L286 205 L321 188 L365 191 L396 178 L437 154 L488 145 L532 159 L566 184 L608 200 L654 207 L708 219 L758 238 L817 256 L864 287 L848 310 L805 323 L748 323 L704 313 L663 298 L617 305 L571 328 L516 341 L468 334 L424 313 L381 317 L340 338 L302 358 L255 357 L214 338 L173 329 L128 335 L88 327 Z"
        fill="url(#sg-mainland-fill)"
        stroke="rgba(34,211,238,0.56)"
        strokeWidth="2.3"
        filter="url(#sg-mainland-soft-glow)"
      />
      <path
        className="singapore-mainland-coast-highlight"
        d="M88 288 C150 252 217 240 286 222 C353 199 408 174 488 162 C564 151 625 207 708 219 C763 228 821 258 850 289"
        fill="none"
        stroke="rgba(255,213,74,0.18)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        className="singapore-mainland-south-coast-highlight"
        d="M97 319 C160 310 214 339 257 348 C316 361 353 323 402 315 C456 306 497 351 560 327 C620 303 648 296 704 313 C751 328 810 323 845 304"
        fill="none"
        stroke="rgba(34,211,238,0.18)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        className="singapore-sentosa"
        d="M365 385 C397 374 447 374 486 386 C458 403 400 404 365 385 Z"
        fill="url(#sg-sentosa-fill)"
        stroke="rgba(34,211,238,0.34)"
        strokeWidth="1.3"
      />
      <path
        className="singapore-map-baseline"
        d="M60 424 H850"
        stroke="rgba(255,213,74,0.12)"
        strokeWidth="1"
        strokeDasharray="2 10"
      />
    </svg>
  );
}
