import Link from "next/link";

export function SiteLogo({ href }: { href: string }) {
  return (
    <Link className="site-logo" href={href} aria-label="TICO home">
      <span className="site-logo__mark" aria-hidden="true">&gt;_</span>
      <span>Tico</span>
    </Link>
  );
}
