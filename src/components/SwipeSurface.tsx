import React, { useMemo } from 'react';
import { PanResponder, View } from 'react-native';
import { horizontalSwipe } from '@/features/navigation/swipeOrder';
export function SwipeSurface({children,onSwipe}:{children:React.ReactNode;onSwipe:(direction:1|-1)=>void}) {
 const pan=useMemo(()=>PanResponder.create({
   onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>25 && Math.abs(g.dx)>Math.abs(g.dy)*1.6,
   onPanResponderRelease:(_,g)=>{if(horizontalSwipe(g.dx,g.dy))onSwipe(g.dx<0?1:-1);},
 }),[onSwipe]);
 return <View style={{flex:1}} {...pan.panHandlers}>{children}</View>;
}
