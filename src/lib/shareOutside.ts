import { Share } from 'react-native';
export async function shareOutside(title:string,url:string):Promise<string> {
  await Share.share({title,message:`${title}\n${url}`,url}); return '';
}
