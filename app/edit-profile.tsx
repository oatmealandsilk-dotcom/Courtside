import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ProfilePhotoPicker } from '@/components/ProfilePhotoPicker';
import { Button, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
export default function EditProfile() {
 const { currentUser, actions }=useApp();
 const [avatarUrl,setAvatarUrl]=useState(currentUser?.avatarUrl);
 const [name,setName]=useState(currentUser?.name ?? '');
 const [bio,setBio]=useState(currentUser?.bio ?? '');
 const [location,setLocation]=useState(currentUser?.location ?? '');
 return <Screen title="Edit Profile" onBack={()=>router.back()}><View style={{gap:20}}><ProfilePhotoPicker name={name} value={avatarUrl} onChange={setAvatarUrl}/><Field label="Name" value={name} onChangeText={setName}/><Field label="Bio" value={bio} onChangeText={setBio} multiline/><Field label="Location" value={location} onChangeText={setLocation}/><Button label="Save changes" disabled={!name.trim()} onPress={()=>{actions.updateIdentity({avatarUrl,name:name.trim(),bio:bio.trim(),location:location.trim()});router.back();}}/></View></Screen>;
}
