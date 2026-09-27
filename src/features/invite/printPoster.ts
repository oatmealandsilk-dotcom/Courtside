import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Four tenths of an inch all round, in points: inside what any home printer can reach.
const MARGINS = { left: 29, right: 29, top: 29, bottom: 29 };

/** The phone's own print sheet: AirPrint, or on Android the system's printers. */
export async function printPoster(html: string): Promise<void> {
  await Print.printAsync({ html, margins: MARGINS });
}

/**
 * The poster as a PDF, handed to the share sheet: save it to Files, AirDrop it
 * to a computer, or email it to the club.
 */
export async function savePosterPdf(html: string, club: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, margins: MARGINS, width: 612, height: 792 });
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: club ? `CourtSide poster for ${club}` : 'CourtSide poster',
  });
}

/** A phone offers print and PDF as two things; a browser's print dialog does both. */
export const posterActions: ('print' | 'pdf')[] = Platform.OS === 'web' ? ['print'] : ['print', 'pdf'];
