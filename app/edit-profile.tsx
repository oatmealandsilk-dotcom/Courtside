import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Field, Screen } from '@/components/ui';
import { useApp } from '@/store/AppContext';
export default function EditProfile() {
 const { currentUser, actions }=useApp();
 const [name,setName]=useState(currentUser?.name ?? '');
 const [bio,setBio]=useState(currentUser?.bio ?? '');
 const [location,setLocation]=useState(currentUser?.location ?? '');
 return <Screen title="Edit Profile" onBack={()=>router.back()}><View style={{gap:20}}><Field label="Name" value={name} onChangeText={setName}/><Field label="Bio" value={bio} onChangeText={setBio} multiline/><Field label="Location" value={location} onChangeText={setLocation}/><Button label="Save changes" disabled={!name.trim()} onPress={()=>{actions.updateIdentity({name:name.trim(),bio:bio.trim(),location:location.trim()});router.back();}}/></View></Screen>;
}
