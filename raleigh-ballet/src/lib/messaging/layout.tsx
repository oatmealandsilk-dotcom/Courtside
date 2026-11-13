import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

/** The frame around every email: studio name on top, body in the middle, address and unsubscribe at the bottom. */
export function EmailLayout(props: { studioName: string; preview: string; html: string; footer: string; unsubscribeUrl?: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ backgroundColor: "#f7f2ee", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 8, maxWidth: 560, padding: "28px 32px" }}>
          <Text style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#3b2338", margin: "0 0 16px" }}>{props.studioName}</Text>
          <Section style={{ fontSize: 15, lineHeight: "24px", color: "#2a2230" }}>
            <div dangerouslySetInnerHTML={{ __html: props.html }} />
          </Section>
          <Hr style={{ borderColor: "#eadfd8", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 12, color: "#7a6d78", margin: 0 }}>{props.footer}</Text>
          {props.unsubscribeUrl ? (
            <Text style={{ fontSize: 12, color: "#7a6d78", margin: "6px 0 0" }}>
              <a href={props.unsubscribeUrl} style={{ color: "#7a6d78" }}>
                Unsubscribe from studio news
              </a>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
