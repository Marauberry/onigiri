export function promptDiff(before='',after=''){
 const a=before.match(/\s+|\S+/g)||[],b=after.match(/\s+|\S+/g)||[];
 const chunks=[],push=(kind,text)=>{if(!text)return;const last=chunks.at(-1);if(last?.kind===kind)last.text+=text;else chunks.push({kind,text});};
 let start=0;while(start<a.length&&start<b.length&&a[start]===b[start])push('same',a[start++]);
 let endA=a.length,endB=b.length;while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){endA--;endB--;}
 const n=endA-start,m=endB-start;
 if(n*m>1e6){push('removed',a.slice(start,endA).join(''));push('added',b.slice(start,endB).join(''));}
 else{const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[start+i]===b[start+j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);let i=0,j=0;while(i<n||j<m){if(i<n&&j<m&&a[start+i]===b[start+j]){push('same',a[start+i++]);j++;}else if(i<n&&(j===m||dp[i+1][j]>=dp[i][j+1]))push('removed',a[start+i++]);else push('added',b[start+j++]);}}
 push('same',a.slice(endA).join(''));return chunks;
}
