import Link from "next/link";
import { SITE } from "@/lib/site";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="logo" href="/" aria-label="Akara Labs" />
            <p className="footer-tag">
              A prototyping and product-engineering studio. आकार — Sanskrit for <em>form</em>: the
              act of giving shape to what does not yet exist.
            </p>
            <div className="footer-deva">आकार</div>
          </div>
          <div>
            <h4>Services</h4>
            <ul>
              <li>
                <Link href="/#services">Design &amp; Prototyping</Link>
              </li>
              <li>
                <Link href="/print/">3D-print request</Link>
              </li>
              <li>
                <Link href="/#services">Small-Batch Production</Link>
              </li>
              <li>
                <Link href="/#services">Custom Gifting</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Resources</h4>
            <ul>
              <li>
                <Link href="/materials/">Materials guide</Link>
              </li>
              <li>
                <Link href="/articles/">Journal</Link>
              </li>
              <li>
                <Link href="/estimate/">Instant print estimate</Link>
              </li>
              <li>
                <Link href="/faq/">FAQ</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Studio</h4>
            <ul>
              <li>
                <Link href="/about/">About</Link>
              </li>
              <li>
                <Link href="/start/">Start a project</Link>
              </li>
              <li>
                <Link href="/track/">Track a request</Link>
              </li>
              <li>
                <a href={`https://wa.me/${SITE.whatsapp}`}>WhatsApp</a>
              </li>
              <li>
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {year} Akara Labs · {SITE.city}
            {SITE.gst ? ` · GSTIN ${SITE.gst}` : ""}
          </span>
          <span className="gst">Made in India</span>
        </div>
      </div>
    </footer>
  );
}
