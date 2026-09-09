import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
export function VerticalPager({children,onIndex}:{children:React.ReactNode[];onIndex:(index:number)=>void}) {
 const [height,setHeight]=useState(0);
 return <View style={{flex:1}} onLayout={e=>setHeight(e.nativeEvent.layout.height)}>{height>0 && <ScrollView pagingEnabled snapToInterval={height} decelerationRate="fast" showsVerticalScrollIndicator={false} onMomentumScrollEnd={e=>onIndex(Math.round(e.nativeEvent.contentOffset.y/height))}>{children.map((child,index)=><View key={index} style={{height}}>{child}</View>)}</ScrollView>}</View>;
}
