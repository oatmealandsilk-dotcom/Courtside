import { Alert, Platform } from 'react-native';

/** "Are you sure?" for something that cannot be undone. Runs `onYes` only on yes. */
export function confirmDelete(onYes: () => void, what = 'this post') {
  const title = `Delete ${what}?`;
  const body = 'This cannot be undone.';
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onYes },
  ]);
}
