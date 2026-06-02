// Local static Singapore outline layer, adapted from real outline references into a dashboard-safe SVG path.
// It intentionally renders only the mainland and a small Sentosa outline; no external map/API is used.
export function SingaporeSvgMap() {
  return (
    <svg
      aria-hidden="true"
      className="accurate-singapore-map real-singapore-outline singapore-map-svg singapore-silhouette-map absolute inset-x-1 top-2 h-[82%] w-[calc(100%-0.5rem)] opacity-95 md:inset-x-4 md:w-[calc(100%-2rem)]"
      data-testid="singapore-silhouette-map"
      data-outline-source="local-static-real-singapore-outline"
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
        d="M71 302 C82 284 104 271 129 266 C152 251 176 233 209 228 C234 225 248 235 271 226 C296 216 313 198 338 193 C363 188 380 194 402 184 C425 173 440 155 468 151 C501 146 526 157 548 174 C575 194 604 202 637 200 C672 198 699 208 724 221 C751 232 782 234 815 248 C846 262 871 282 874 299 C877 317 854 326 821 324 C795 322 775 334 746 332 C717 330 693 313 664 307 C633 301 608 317 581 331 C553 346 520 350 493 341 C466 332 453 311 428 309 C401 307 386 326 360 339 C333 353 305 363 277 356 C248 348 224 332 194 329 C165 326 143 340 113 335 C90 331 69 319 71 302 Z"
        fill="url(#sg-mainland-fill)"
        stroke="rgba(34,211,238,0.56)"
        strokeWidth="2.3"
        filter="url(#sg-mainland-soft-glow)"
      />
      <path
        className="singapore-mainland-coast-highlight"
        d="M91 292 C145 259 184 238 251 233 C294 229 318 200 361 195 C416 188 442 160 491 157 C554 153 587 203 645 207 C711 211 777 237 851 287"
        fill="none"
        stroke="rgba(255,213,74,0.18)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        className="singapore-mainland-south-coast-highlight"
        d="M95 319 C152 319 185 329 225 338 C281 351 315 363 364 337 C398 319 420 304 451 316 C485 330 506 352 554 339 C612 323 633 302 674 310 C717 319 756 333 824 321 C850 316 865 307 874 298"
        fill="none"
        stroke="rgba(34,211,238,0.18)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        className="singapore-sentosa"
        data-testid="sentosa-outline"
        data-map-bounds="397,383,498,407"
        d="M397 391 C412 384 431 383 448 386 C460 389 474 386 489 390 C498 392 496 398 485 402 C469 407 451 404 437 402 C422 400 410 404 395 399 C389 396 391 393 397 391 Z"
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
